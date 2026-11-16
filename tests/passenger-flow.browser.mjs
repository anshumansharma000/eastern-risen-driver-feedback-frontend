// Passenger UX regression: all API responses are simulated, with no live mutations.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.FEEDBACK_PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_EXECUTABLE?{executablePath:process.env.FEEDBACK_BROWSER_EXECUTABLE}:{})});
const base=process.env.FEEDBACK_PREVIEW_URL||'http://localhost:3000';
const session=await browser.newContext({viewport:{width:390,height:844}}),page=await session.newPage();
let attempts=0,starts=0,emptyQuestionnaire=false;const submissions=[];
const context=()=>({allowMultipleSubmissions:true,engagement:{id:'test',sequenceNumber:1,bookingReference:'BOOK',driver:{displayName:'Test Driver'},trips:[]},questionnaire:{schemaVersion:2,sections:[{purpose:'DRIVER_FEEDBACK',title:'Your journey',questionnaireId:'q',questionnaireVersionId:'v',versionNumber:1,questions:emptyQuestionnaire?[]:[{id:'comment',prompt:'Tell us about your journey.',questionType:'TEXT',isRequired:true,options:[]},{id:'safe',prompt:'Did you feel safe?',questionType:'YES_NO',isRequired:true,options:[]}]}]},consent:{id:'consent',content:'Test privacy notice. Your mobile number identifies this response.',version:1},completion:{agencyName:'Eastern Risen',timezone:'Asia/Kolkata',thankYouMessage:'Thank you for travelling with Eastern Risen.'}});
await session.route('**/api/v1/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 const respond=data=>route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
 if(path.endsWith('/context'))return respond(context());
 if(path.endsWith('/start')){starts++;return respond({engagementId:'test',status:'FEEDBACK_STARTED',startedFeedbackAt:new Date().toISOString()})}
 if(path.endsWith('/submissions')){
  const body=request.postDataJSON();submissions.push(body);attempts++;
  const field=attempts===1?'respondent.phone':attempts===2?'answers.0.value':attempts===3?'submissionPolicy':null;
  if(field)return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{code:'REQUEST_VALIDATION_FAILED',message:'Please check your feedback.',requestId:'test-validation',details:{fields:[{field,message:field==='respondent.phone'?'Use a different mobile number.':field==='answers.0.value'?'Please add more detail.':'Please check the submission settings.',rule:'validation'}]}}})});
  return respond({id:'accepted',clientSubmissionId:body.clientSubmissionId,engagementId:'test',receivedAt:new Date().toISOString(),replayed:false});
 }
 throw new Error(`Unexpected request ${path}`);
});
async function focused(id){
 await page.waitForFunction(id=>document.activeElement?.id===id,id);
 assert.equal(await page.locator(`#${id}`).evaluate(element=>{const rect=element.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight-75}),true,`${id} must be visible above the sticky actions`);
}
const next=()=>page.getByRole('button',{name:'Continue to questions →',exact:true}).click();
const review=()=>page.getByRole('button',{name:'Review feedback →',exact:true}).click();
async function send(){await page.getByRole('button',{name:'Add optional photo →',exact:true}).click();await page.getByRole('button',{name:'Submit feedback without photo',exact:true}).click()}
try{
 await page.goto(base+'/feedback?token=fixture');
 await page.getByLabel('Mobile number',{exact:true}).waitFor();
 assert.equal(await page.title(),'Journey feedback');
 assert.equal(await page.locator('.brand').count(),0);
 assert.doesNotMatch(await page.locator('body').innerText(),/Eastern Risen/);
 assert.match(await page.locator('link[rel=icon]').last().getAttribute('href'),/feedback-icon\.svg$/);
 assert.equal(await page.getByLabel('Name (optional)',{exact:true}).getAttribute('required'),null);
 assert.equal(await page.getByLabel('Email address (optional)',{exact:true}).getAttribute('required'),null);
 assert.equal(await page.getByLabel('Booking reference (optional)',{exact:true}).inputValue(),'');
 await next();await focused('respondentPhone-national');assert.equal(starts,0);
 await next();await focused('respondentPhone-national');
 await page.screenshot({path:'/tmp/passenger-feedback-validation.png'});
 await page.getByLabel('Mobile number',{exact:true}).fill('9876543210');await next();await focused('consent');assert.equal(starts,0);
 await page.getByRole('checkbox').check();await page.getByText('Add optional details',{exact:true}).click();await page.getByLabel('Email address (optional)',{exact:true}).fill('invalid');await page.getByText('Add optional details',{exact:true}).click();await next();await focused('email');assert.equal(starts,0);
 await page.getByLabel('Email address (optional)',{exact:true}).fill('');await next();
 await page.getByRole('button',{name:'Next question →',exact:true}).click();await focused('question-comment');
 await page.getByRole('button',{name:'Next question →',exact:true}).click();await focused('question-comment');
 await page.getByLabel('Tell us about your journey.').fill('A comfortable journey.');await page.getByRole('button',{name:'Next question →',exact:true}).click();
 await review();await focused('question-safe');await page.getByLabel('Yes',{exact:true}).check();await review();
 await send();await focused('respondentPhone-national');assert.equal(await page.getByLabel('Mobile number',{exact:true}).inputValue(),'9876543210');
 await page.getByLabel('Mobile number',{exact:true}).fill('442079460958');await next();await review();
 await send();await focused('question-comment');assert.equal(await page.getByLabel('Tell us about your journey.').inputValue(),'A comfortable journey.');
 await page.getByLabel('Tell us about your journey.').fill('The driver was punctual and the journey comfortable.');await page.getByRole('button',{name:'Next question →',exact:true}).click();await review();
 await send();await focused('passenger-error-summary');assert.equal(await page.getByRole('heading',{name:'Review your feedback.'}).isVisible(),true);
 await send();await page.getByRole('heading',{name:'Thank you for sharing your journey.'}).waitFor();
 assert.doesNotMatch(await page.locator('body').innerText(),/Eastern Risen/);
 const respondent=submissions.at(-1).respondent;
 assert.deepEqual(Object.keys(respondent).sort(),['consentAccepted','consentedAt','phone']);assert.equal(respondent.phone,'+442079460958');assert.equal(respondent.consentAccepted,true);
 assert.equal(new Set(submissions.map(body=>body.clientSubmissionId)).size,1);assert.equal(starts,1);
 // A questionnaire with no active questions proceeds directly to review.
 emptyQuestionnaire=true;await page.getByRole('button',{name:'Give feedback as another traveller'}).click();await page.getByLabel('Mobile number',{exact:true}).fill('9876543210');await page.getByRole('checkbox').check();await next();await page.getByRole('heading',{name:'Review your feedback.'}).waitFor();
 console.log('PASS: optional contact details, mobile/consent validation, repeated focus and scroll, required text/choice focus, server field routing, unknown error recovery, retained answers and IDs, omitted payload fields, and empty questionnaires.');
}finally{await browser.close()}
