import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError, apiRequest} from '../lib/api.ts';
import {PassengerDraft, closeGroupFeedback, generateFeedbackLink, normalizeRespondentPhone, readFeedbackMode} from '../lib/group-feedback.ts';
import {syncQueuedFeedback} from '../lib/offline-queue.ts';
import {phoneError} from '../lib/phone.ts';
import {shareFeedbackLink} from '../lib/feedback-link.ts';
import {buildWhatsAppFeedbackMessage} from '../lib/whatsapp-feedback.ts';

const envelope=(phone='+919876543210',photoId='photo-one')=>({questionnaireSnapshot:{schemaVersion:2,sections:[]},respondent:{name:'Traveller',phone,email:'a@example.com',bookingReference:'BOOK',consentAccepted:true,consentedAt:'2026-10-13T00:00:00Z'},answers:[{questionId:'question',value:5}],submittedAt:'2026-10-13T00:00:00Z',submissionMode:'ONLINE',photoId});
test('generation sends explicit chosen modes, preserves unknown mode with required body, and trusts returned mode',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({data:{engagementId:'one',feedbackLink:'https://example.com/feedback?token=one',feedbackAccessTokenExpiresAt:'2030-01-01',allowMultipleSubmissions:true}})};
 try{
  assert.equal((await generateFeedbackLink('admin','one',true)).allowMultipleSubmissions,true);
  assert.equal((await generateFeedbackLink('driver','one',false)).allowMultipleSubmissions,true);
  await generateFeedbackLink('admin','one');
  assert.deepEqual(calls.map(c=>JSON.parse(c.init.body)),[{allowMultipleSubmissions:true},{allowMultipleSubmissions:false},{}]);
  assert.ok(calls.every(c=>c.init.method==='POST'&&c.init.credentials==='include'));
 }finally{globalThis.fetch=original}
 assert.throws(()=>readFeedbackMode({}),error=>error.code==='MALFORMED_API_RESPONSE');
});
test('international formatting normalizes consistently without inferring a country',()=>{
 for(const phone of ['+91 98765-43210','0091 (98765) 43210','+91.98765.43210'])assert.equal(normalizeRespondentPhone(phone),'+919876543210');
 assert.ok(phoneError(normalizeRespondentPhone('9876543210')));
 assert.ok(phoneError(normalizeRespondentPhone('+91x9876543210')));
});
test('each traveller owns a distinct ID, answers and photo; retries freeze the exact envelope',()=>{
 const first=new PassengerDraft(),second=new PassengerDraft();const data=envelope();const saved=first.prepare(data);
 data.answers[0].value=1;data.photoId='other-photo';data.respondent.phone='+442079460123';
 assert.deepEqual(first.prepare(data),saved);
 const secondSaved=second.prepare(data);assert.notEqual(saved.clientSubmissionId,secondSaved.clientSubmissionId);assert.equal(secondSaved.photoId,'other-photo');assert.equal(saved.photoId,'photo-one');
 first.correctRejectedPayload();assert.equal(first.prepare(data).clientSubmissionId,saved.clientSubmissionId);
});
test('closure is admin-only, sends no body, and accepts an empty 204 without JSON parsing',async()=>{
 const original=globalThis.fetch;let call;
 globalThis.fetch=async(url,init)=>{call={url,init};return new Response(null,{status:204})};
 try{assert.equal(await closeGroupFeedback('engagement/one'),undefined);assert.match(call.url,/\/admin\/engagements\/engagement%2Fone\/close-feedback$/);assert.equal(call.init.body,undefined);assert.equal(call.init.method,'POST')}finally{globalThis.fetch=original}
});
test('group native and WhatsApp share text invites each traveller with their own phone',async()=>{
 let data;await shareFeedbackLink('https://example.com',async(value)=>{data=value},true);assert.match(data.text,/own phone number/);assert.match(buildWhatsAppFeedbackMessage('Organiser','https://example.com',true),/share this link with your group/);
});
test('respondent, access and ID errors preserve recovery and are not retryable',()=>{
 for(const code of ['RESPONDENT_FEEDBACK_ALREADY_SUBMITTED','RESPONDENT_PHONE_INVALID','CLIENT_SUBMISSION_ID_CONFLICT','ENGAGEMENT_FEEDBACK_ALREADY_SUBMITTED','FEEDBACK_HANDOFF_INVALID','FEEDBACK_LINK_MODE_LOCKED']){
  const error=new ApiError(code==='FEEDBACK_HANDOFF_INVALID'?401:code==='RESPONDENT_PHONE_INVALID'?400:409,code,'server');assert.equal(error.retryable,false);assert.notEqual(error.userMessage,'server');
 }
});
test('mocked submission contract supports two travellers, engagement-scoped deduplication, replay, and closed access',async()=>{
 const original=globalThis.fetch,accepted=new Map(),phones=new Set();let closed=false;
 globalThis.fetch=async(url,init)=>{
  const body=JSON.parse(init.body),engagement=init.headers.get('authorization'),key=engagement+':'+normalizeRespondentPhone(body.respondent.phone);
  const reject=(code,status=409)=>Response.json({error:{code,message:'Rejected'}},{status});
  if(accepted.has(body.clientSubmissionId)){const prior=accepted.get(body.clientSubmissionId);return prior.key===key?Response.json({data:{...prior.receipt,replayed:true}}):reject('CLIENT_SUBMISSION_ID_CONFLICT')}
  if(closed)return reject('FEEDBACK_HANDOFF_INVALID',401);
  if(phones.has(key))return reject('RESPONDENT_FEEDBACK_ALREADY_SUBMITTED');
  phones.add(key);const receipt={id:crypto.randomUUID(),clientSubmissionId:body.clientSubmissionId,replayed:false};accepted.set(body.clientSubmissionId,{key,receipt});return Response.json({data:receipt},{status:201});
 };
 const submit=(token,body)=>apiRequest('/api/v1/passenger/feedback/submissions',{method:'POST',passengerToken:token,body:JSON.stringify(body)});
 try{
  const one=new PassengerDraft().prepare(envelope()),two=new PassengerDraft().prepare(envelope('+442079460123','photo-two'));
  assert.equal((await submit('engagement-one',one)).data.replayed,false);assert.equal((await submit('engagement-one',two)).data.replayed,false);
  assert.equal((await submit('engagement-one',one)).data.replayed,true);
  await assert.rejects(submit('engagement-one',new PassengerDraft().prepare(envelope('0091 (98765) 43210'))),e=>e.code==='RESPONDENT_FEEDBACK_ALREADY_SUBMITTED');
  assert.equal((await submit('engagement-two',new PassengerDraft().prepare(envelope()))).data.replayed,false);
  await assert.rejects(submit('engagement-two',one),e=>e.code==='CLIENT_SUBMISSION_ID_CONFLICT');
  closed=true;await assert.rejects(submit('engagement-one',new PassengerDraft().prepare(envelope('+12025550123'))),e=>e.code==='FEEDBACK_HANDOFF_INVALID');
  assert.equal((await submit('engagement-one',one)).data.replayed,true);
 }finally{globalThis.fetch=original}
});

test('offline terminal errors retain the exact token, ID, answers and photo for attention',async()=>{
 const original=globalThis.fetch;
 const data=new PassengerDraft().prepare(envelope());
 const item={id:data.clientSubmissionId,token:'offline-token',envelope:data,attempts:0,state:'WAITING',createdAt:'2026-10-13',nextAttemptAt:'2026-10-13'};
 try {
  for(const code of ['RESPONDENT_FEEDBACK_ALREADY_SUBMITTED','RESPONDENT_PHONE_INVALID','CLIENT_SUBMISSION_ID_CONFLICT','ENGAGEMENT_FEEDBACK_ALREADY_SUBMITTED','FEEDBACK_HANDOFF_INVALID']){
   globalThis.fetch=async()=>Response.json({error:{code,message:'Rejected'}},{status:code==='FEEDBACK_HANDOFF_INVALID'?401:code==='RESPONDENT_PHONE_INVALID'?400:409});
   const pending=await syncQueuedFeedback(item);assert.equal(pending.state,'NEEDS_ATTENTION');assert.equal(pending.lastErrorCode,code);assert.deepEqual(pending.envelope,data);assert.equal(pending.token,item.token);assert.equal(pending.id,item.id);
  }
  globalThis.fetch=async()=>Response.json({data:{replayed:true}},{status:200});assert.equal(await syncQueuedFeedback(item),null);
 }finally{globalThis.fetch=original}
});
