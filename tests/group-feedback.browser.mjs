// Optional UI integration suite: run against a local preview; every API is mocked.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.FEEDBACK_PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_EXECUTABLE?{executablePath:process.env.FEEDBACK_BROWSER_EXECUTABLE}:{})});
const base=process.env.FEEDBACK_PREVIEW_URL||'http://127.0.0.1:3000';
const session=await browser.newContext({viewport:{width:390,height:844}});const page=await session.newPage();
const calls=[],receipts=new Map(),phones=new Set();let engagement='one',mode=true,errorCode=null,uncertain=false,closed=false;
let feedbackBranding = { title: null, logo: null };
const now=()=>new Date().toISOString();
const context=()=>({feedbackBranding,allowMultipleSubmissions:mode,engagement:{id:engagement,sequenceNumber:1,bookingReference:'BOOK',driver:{displayName:'Driver'},trips:[]},questionnaire:{schemaVersion:2,sections:[{purpose:'DRIVER_FEEDBACK',title:'Driver service',questionnaireId:'q',questionnaireVersionId:'v',versionNumber:1,questions:[{id:'rating',prompt:'How was your driver?',questionType:'STAR_RATING',isRequired:true,scoreMin:1,scoreMax:5,options:[]}]}]},consent:{id:'consent',content:'Test consent',version:1,effectiveAt:now()},completion:{agencyName:'Agency',timezone:'Asia/Kolkata',thankYouMessage:'Thank you.'}});
const passengerRoute=async route=>{
 const r=route.request(),path=new URL(r.url()).pathname,body=r.postDataJSON();calls.push({path,method:r.method(),body,authorization:r.headers().authorization});
 const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
 const reject=(code,status=409)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{code,message:'Rejected'}})});
 if(!path.includes('/passenger/'))throw new Error(`Unexpected ${path}`);
 assert.equal(r.headers().authorization,'Bearer group-token');
 if(closed)return reject('FEEDBACK_HANDOFF_INVALID',401);
 if(path.endsWith('/context'))return respond(context());
 if(path.endsWith('/start'))return respond({engagementId:engagement,status:'FEEDBACK_STARTED',startedFeedbackAt:now()});
 if(path.endsWith('/photo-uploads'))return respond({id:'photo-'+receipts.size,uploadUrl:base+'/mock-photo-upload',method:'PUT',headers:{'Content-Type':'image/png'},expiresAt:'2099-01-01',maxBytes:100000});
 if(path.endsWith('/complete'))return respond({id:path.split('/').at(-2),status:'READY',contentType:'image/jpeg',byteSize:100,completedAt:now()});
 if(path.endsWith('/submissions')){
  if(errorCode){const code=errorCode;errorCode=null;return reject(code,code==='RESPONDENT_PHONE_INVALID'?400:409)}
  const key=engagement+':'+body.respondent.phone;
  if(receipts.has(body.clientSubmissionId))return respond({...receipts.get(body.clientSubmissionId),replayed:true});
  if(phones.has(key))return reject('RESPONDENT_FEEDBACK_ALREADY_SUBMITTED');
  if(!mode&&receipts.size)return reject('ENGAGEMENT_FEEDBACK_ALREADY_SUBMITTED');
  const receipt={id:'receipt-'+receipts.size,clientSubmissionId:body.clientSubmissionId,engagementId:engagement,receivedAt:now(),replayed:false};receipts.set(body.clientSubmissionId,receipt);phones.add(key);
  if(uncertain){uncertain=false;return route.abort('timedout')}
  return respond(receipt,201);
 }
 throw new Error(`Unexpected ${path}`);
};
await session.route('**/api/v1/**',passengerRoute);
await session.route('**/mock-photo-upload',route=>route.fulfill({status:200,body:''}));
async function fill(phone,name='Traveller'){
 await page.getByText('Add optional details',{exact:true}).click();
 await page.getByLabel('Name (optional)',{exact:true}).fill(name);await page.getByLabel('Email address (optional)',{exact:true}).fill('traveller@example.com');await page.getByLabel('Mobile number',{exact:true}).fill(phone);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Continue to questions →'}).click();await page.waitForFunction(()=>document.activeElement?.textContent.includes('How was your driver?'));await page.getByRole('button',{name:'5 out of 5'}).click();await page.getByRole('button',{name:'Review feedback →'}).click();await page.getByRole('button',{name:'Add optional photo →',exact:true}).click();
}
async function another(){await page.getByRole('button',{name:'Give feedback as another traveller'}).click();await page.getByLabel('Mobile number',{exact:true}).waitFor();assert.equal(await page.getByLabel('Name (optional)',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('Mobile number',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('Mobile number country code',{exact:true}).inputValue(),'+91');}
try{
 const loginSession=await browser.newContext({viewport:{width:390,height:844}});
 const loginPage=await loginSession.newPage();let loginRequests=0;
 await loginSession.route('**/api/v1/**',route=>{loginRequests++;return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'UNEXPECTED_REQUEST',message:'Unexpected request'}})})});
 await loginPage.goto(base+'/admin/login');await loginPage.waitForLoadState('networkidle');
 await loginPage.getByRole('button',{name:'Sign in securely'}).click();
 await loginPage.getByText('Enter your email address.',{exact:true}).waitFor();
 assert.equal(await loginPage.evaluate(()=>document.activeElement.id),'identity');
 await loginPage.getByLabel('Email address',{exact:true}).fill('invalid-email');
 await loginPage.getByRole('button',{name:'Sign in securely'}).click();
 await loginPage.getByText('Enter a valid email address.',{exact:true}).waitFor();
 await loginPage.getByLabel('Email address',{exact:true}).fill('admin@example.com');
 await loginPage.getByRole('button',{name:'Sign in securely'}).click();
 assert.equal(await loginPage.evaluate(()=>document.activeElement.id),'password');
 assert.equal(loginRequests,0);await loginSession.close();
 await page.goto(base+'/feedback?token=group-token');await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Continue to questions →'}).click();await page.getByText('Enter your mobile number.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),'respondentPhone-national');await fill('98765 43210','First');
 await page.locator('#library-photo').setInputFiles({name:'first.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZJkAAAAASUVORK5CYII=','base64')});await page.getByRole('button',{name:'Upload photo',exact:true}).click();await page.getByRole('button',{name:'Submit feedback with photo'}).click();await page.getByRole('heading',{name:'Thank you for sharing your journey.'}).waitFor();assert.match(page.url(),/token=group-token/);
 await another();await fill('44 20 7946 0123','Second');uncertain=true;await page.getByRole('button',{name:'Submit feedback without photo'}).click();await page.getByRole('button',{name:'Retry this response'}).waitFor();await page.getByRole('button',{name:'Retry this response'}).click();await page.getByRole('heading',{name:'Thank you for sharing your journey.'}).waitFor();
 const submissions=calls.filter(c=>c.path.endsWith('/submissions'));assert.equal(submissions[0].body.respondent.phone,'+919876543210');assert.equal(submissions[1].body.respondent.phone,'+442079460123');assert.equal(submissions[0].body.photoId,'photo-0');assert.equal(submissions[1].body.photoId,undefined);assert.notEqual(submissions[0].body.clientSubmissionId,submissions[1].body.clientSubmissionId);assert.deepEqual(submissions[1].body,submissions[2].body);assert.equal(receipts.size,2);
 await another();await fill('+91.98765.43210');await page.getByRole('button',{name:'Submit feedback without photo'}).click();await page.getByText('Feedback has already been submitted with this phone number for this part of your journey.').waitFor();assert.equal(await page.getByLabel('Mobile number',{exact:true}).isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'respondentPhone-national');
 engagement='two';await page.reload();await fill('+919876543210');await page.getByRole('button',{name:'Submit feedback without photo'}).click();await page.getByRole('heading',{name:'Thank you for sharing your journey.'}).waitFor();assert.equal(receipts.size,3);
 await another();await fill('+12025550123');await session.setOffline(true);await page.getByRole('button',{name:'Submit feedback without photo'}).click();await page.getByRole('button',{name:'Retry this response'}).waitFor();await session.setOffline(false);errorCode='CLIENT_SUBMISSION_ID_CONFLICT';await page.getByRole('button',{name:'Retry this response'}).click();await page.getByText(/This response identifier conflicts/).waitFor();assert.equal(await page.getByRole('button',{name:'Retry this response'}).isDisabled(),true);assert.equal(await page.getByText('5',{exact:true}).isVisible(),true);
 closed=true;await page.reload();await page.getByRole('heading',{name:'This feedback link has expired.'}).waitFor();closed=false;mode=false;engagement='single';receipts.clear();phones.clear();await page.reload();await fill('+12025550123');await page.getByRole('button',{name:'Submit feedback without photo'}).click();await page.getByRole('heading',{name:'Thank you for sharing your journey.'}).waitFor();assert.match(page.url(),/feedback\/hand-back/);assert.equal(await page.getByRole('button',{name:'Give feedback as another traveller'}).count(),0);
 console.log('Passenger group, photo isolation, duplicate, retry, offline, expired and single-response UI checks passed.');
 const admin=await browser.newContext();const adminPage=await admin.newPage();let group=false,locked=false,collectionClosed=false,bookingReads=0;const linkCalls=[];
 const driver={id:'driver',displayName:'Test Driver',driverCode:'D1',sourceType:'AGENCY',vendorName:null};
 const engagementData=()=>({id:'engagement',sequenceNumber:1,driver,booking:{id:'booking',bookingReference:'BOOK',passengerName:'Organiser'},feedbackPurposes:['DRIVER_FEEDBACK'],status:collectionClosed?'SUBMITTED':locked?'FEEDBACK_STARTED':'READY',trips:[],startedFeedbackAt:locked?now():null,createdAt:now(),updatedAt:now(),archivedAt:null});
 const linkData=()=>({engagementId:'engagement',feedbackLink:base+'/feedback?token=group-token',feedbackAccessTokenExpiresAt:'2099-01-01',allowMultipleSubmissions:group,recipient:{name:'Organiser',phone:'+919876543210'}});
 await admin.route('**/api/v1/**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname;
  const respond=data=>route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
  if(path.endsWith('/auth/me'))return respond({user:{accountId:'admin',displayName:'Admin',role:'ADMIN'}});
  if (path.endsWith('/bookings/booking/feedback-branding')) {
   assert.equal(r.method(), 'PATCH');
   feedbackBranding = { ...feedbackBranding, ...r.postDataJSON() };
   return respond(feedbackBranding);
  }
  if(path.endsWith('/bookings/booking')){bookingReads++;return respond({id:'booking',bookingReference:'BOOK',passengerName:'Organiser',passengerPhone:'+919876543210',startsAt:now(),endsAt:now(),status:'ACTIVE',tripCount:0,feedbackBranding,engagements:[engagementData()]})}
  if(path.endsWith('/feedback-link')){
   const body=r.postDataJSON();linkCalls.push({method:r.method(),body});
   if(locked&&body?.allowMultipleSubmissions!==undefined&&body.allowMultipleSubmissions!==group)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'FEEDBACK_LINK_MODE_LOCKED',message:'Locked'}})});
   if(body?.allowMultipleSubmissions!==undefined)group=body.allowMultipleSubmissions;
   return respond(linkData());
  }
  if(path.endsWith('/close-feedback')){assert.equal(r.method(),'POST');assert.equal(r.postData(),null);collectionClosed=true;return route.fulfill({status:204})}
  throw new Error(`Unexpected admin request ${path}`);
 });
 await admin.addInitScript(() => { window.open=()=>({closed:false,opener:null,close(){},location:{set href(url){window.__whatsappUrl=url}}}); });
 await adminPage.goto(base+'/admin/bookings/detail/?bookingId=booking');await adminPage.getByRole('tab',{name:'Passenger feedback',exact:true}).click();
 const title = adminPage.getByRole('textbox', { name: 'Feedback title (optional)' });
 const saveBranding = adminPage.getByRole('button', { name: 'Save feedback branding' });
 await title.fill('Your trip with Coastal Tours');
 await adminPage.getByLabel('Client logo (optional)').setInputFiles({
  name: 'client.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZJkAAAAASUVORK5CYII=', 'base64'),
 });
 await adminPage.getByRole('img', { name: 'Travel provider logo' }).waitFor();
 await saveBranding.click();
 await adminPage.getByText('Feedback branding saved.', { exact: true }).waitFor();
 await adminPage.reload();
 await adminPage.getByRole('img', { name: 'Travel provider logo' }).waitFor();
 assert.equal(await title.inputValue(), 'Your trip with Coastal Tours');

 await page.goto(base + '/feedback?token=group-token');
 await page.getByText('Your trip with Coastal Tours', { exact: true }).waitFor();
 const logo = page.getByRole('img', { name: 'Travel provider logo' });
 assert.equal(await logo.getAttribute('src'), feedbackBranding.logo);
 await page.waitForFunction(() => document.querySelector('.feedback-branding-logo')?.naturalWidth > 0);

 await title.fill('');
 await adminPage.getByRole('button', { name: 'Remove logo' }).click();
 await saveBranding.click();
 await adminPage.getByText('Feedback branding saved.', { exact: true }).waitFor();
 assert.deepEqual(feedbackBranding, { title: null, logo: null });
 await page.reload();
 await page.getByRole('heading', { name: 'Your journey matters to us.' }).waitFor();
 await page.getByText('Journey feedback', { exact: true }).waitFor();
 assert.equal(await logo.count(), 0);
 console.log('Booking branding preview, save, reload, passenger display and clearing passed.');
 const toggle=adminPage.getByRole('checkbox',{name:'Allow feedback from multiple travellers'});await toggle.waitFor();
 await adminPage.getByRole('button',{name:'Share feedback on WhatsApp'}).waitFor();
 await adminPage.waitForFunction(()=>!document.querySelector('.feedback-collection-mode input').disabled);
 assert.equal(await toggle.isChecked(),false);assert.equal(await adminPage.getByRole('dialog').count(),0);
 await toggle.click();await adminPage.getByText('Loading collection mode…').waitFor({state:'detached'});assert.equal(await toggle.isChecked(),true);assert.deepEqual(linkCalls.at(-1).body,{allowMultipleSubmissions:true});
 await adminPage.getByRole('button',{name:'Share feedback on WhatsApp'}).click();await adminPage.getByText('WhatsApp opened. Review the message, then press Send in WhatsApp.').waitFor();
 const whatsappUrl=await adminPage.evaluate(()=>window.__whatsappUrl);assert.match(new URL(whatsappUrl).searchParams.get('text'),/share this link with your group/);assert.match(new URL(whatsappUrl).searchParams.get('text'),/own phone number/);
 await adminPage.getByRole('button',{name:'Share feedback link',exact:true}).click();await adminPage.getByRole('textbox',{name:'Passenger feedback link'}).waitFor();assert.equal(await adminPage.getByRole('dialog').getByRole('checkbox').count(),0);
 const originalUrl=await adminPage.getByRole('textbox',{name:'Passenger feedback link'}).inputValue();await adminPage.getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await toggle.isChecked(),true);assert.deepEqual(linkCalls.at(-1).body,{});
 locked=true;await toggle.click();await adminPage.getByText('The collection mode is fixed because passenger feedback has started.').waitFor();assert.equal(await toggle.count(),0);await adminPage.getByText('Group feedback',{exact:true}).waitFor();
 await adminPage.getByRole('button',{name:'Share feedback link',exact:true}).click();await adminPage.getByRole('textbox',{name:'Passenger feedback link'}).waitFor();assert.equal(await adminPage.getByRole('textbox',{name:'Passenger feedback link'}).inputValue(),originalUrl);
 await adminPage.getByRole('button',{name:'Close group feedback',exact:true}).click();await adminPage.getByRole('alertdialog').waitFor();const beforeClose=bookingReads;await adminPage.getByRole('alertdialog').getByRole('button',{name:'Close group feedback',exact:true}).click();await adminPage.getByRole('dialog').waitFor({state:'detached'});assert.equal(collectionClosed,true);await adminPage.getByText('Feedback received',{exact:true}).waitFor();assert.ok(bookingReads>beforeClose);
 await admin.close();
 const driverSession=await browser.newContext({viewport:{width:390,height:844}});const driverPage=await driverSession.newPage();
 await driverSession.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data;
  if(path.includes('/passenger/'))return passengerRoute(route);
  if(path.endsWith('/start-feedback'))data={...engagementData(),allowMultipleSubmissions:true,feedbackAccessToken:'group-token',feedbackAccessTokenExpiresAt:'2099-01-01',feedbackLink:base+'/feedback?token=group-token'};
  else if(path.endsWith('/auth/me'))data={user:{accountId:'driver',driverId:'driver',displayName:'Driver',role:'DRIVER'}};
  else if(path.endsWith('/feedback-link'))data={...linkData(),recipient:undefined};
  else if(path.endsWith('/engagements'))return route.fulfill({contentType:'application/json',body:JSON.stringify({data:route.request().url().includes('READY')?[{...engagementData(),status:'READY'}]:[],pagination:{page:1,pageSize:25,total:1}})});
  else throw new Error(`Unexpected driver ${path}`);
  return route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
 });
 await driverPage.goto(base+'/driver');await driverPage.getByRole('checkbox',{name:'Allow feedback from multiple travellers'}).waitFor();
 await driverPage.waitForFunction(()=>!document.querySelector('.feedback-sharing-actions').disabled);
 for(const width of [320,390,1440]){
  await driverPage.setViewportSize({width,height:900});
  assert.deepEqual(await driverPage.locator('.trip-card, .trip-card button, .trip-card .status').evaluateAll(elements=>elements.filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.left<0}).map(e=>e.className)),[],`Journey controls must fit at ${width}px`);
 }
 await driverPage.setViewportSize({width:390,height:844});
 assert.ok(await driverPage.locator('.trip-card').first().evaluate(e=>e.getBoundingClientRect().top)<500,'First journey should appear before 500px on mobile');
 await driverPage.getByRole('button',{name:'Share feedback link',exact:true}).click();await driverPage.getByRole('textbox',{name:'Passenger feedback link'}).waitFor();assert.equal(await driverPage.getByRole('dialog').getByRole('checkbox').count(),0);assert.equal(await driverPage.getByRole('button',{name:'Close group feedback',exact:true}).count(),0);await driverPage.getByRole('button',{name:'Close',exact:true}).click();
 mode=true;engagement='offline';
 await driverSession.route('**/mock-photo-upload',route=>route.fulfill({status:200,body:''}));
 await driverPage.getByRole('button',{name:'Start passenger handoff'}).click();await driverPage.getByRole('button',{name:'Begin handoff'}).click();
 await driverPage.getByLabel('Mobile number',{exact:true}).waitFor();
 // Reuse the same form helper against the driver handoff page.
 await driverPage.getByText('Add optional details',{exact:true}).click();await driverPage.getByLabel('Name (optional)',{exact:true}).fill('Offline Traveller');await driverPage.getByLabel('Email address (optional)',{exact:true}).fill('offline@example.com');await driverPage.getByLabel('Mobile number',{exact:true}).fill('+33123456789');await driverPage.getByRole('checkbox').check();await driverPage.getByRole('button',{name:'Continue to questions →'}).click();await driverPage.getByRole('button',{name:'5 out of 5'}).click();await driverPage.getByRole('button',{name:'Review feedback →'}).click();await driverPage.getByRole('button',{name:'Add optional photo →',exact:true}).click();
 await driverPage.locator('#library-photo').setInputFiles({name:'offline.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZJkAAAAASUVORK5CYII=','base64')});await driverPage.getByRole('button',{name:'Upload photo',exact:true}).click();await driverPage.getByRole('button',{name:'Submit feedback with photo'}).waitFor();await driverSession.setOffline(true);await driverPage.getByRole('button',{name:'Submit feedback with photo'}).click();await driverPage.getByRole('heading',{name:'Thank you for sharing your journey.'}).waitFor();
 const pending=await driverPage.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('eastern-risen-feedback',1);req.onsuccess=()=>{const db=req.result;const get=db.transaction('pending-submissions').objectStore('pending-submissions').getAll();get.onsuccess=()=>{db.close();resolve(get.result)};get.onerror=()=>reject(get.error)};req.onerror=()=>reject(req.error)}));assert.equal(pending.length,1);assert.equal(pending[0].envelope.respondent.name,'Offline Traveller');assert.equal(pending[0].envelope.photoId,'photo-1');assert.equal(pending[0].envelope.clientSubmissionId,pending[0].id);assert.equal(await driverPage.getByRole('button',{name:'Give feedback as another traveller'}).count(),0);
 await driverSession.close();
 console.log('Admin toggle, authoritative mode, lock recovery, closure refresh and driver boundary UI checks passed.');

}catch(error){for(const context of browser.contexts())for(const currentPage of context.pages())console.error(currentPage.url(),(await currentPage.locator('body').innerText()).slice(-2000));throw error;}finally{await session.close();await browser.close()}
