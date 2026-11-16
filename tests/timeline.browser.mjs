// Optional browser integration suite. Run against a local preview; all API and storage
// requests are intercepted with the supplied timeline contract, never a live backend.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.TIMELINE_PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TIMELINE_BROWSER_EXECUTABLE?{executablePath:process.env.TIMELINE_BROWSER_EXECUTABLE}:{})});
const base=process.env.TIMELINE_PREVIEW_URL||'http://localhost:3000';
const current=()=>new Date().toISOString();
async function until(check){const end=Date.now()+15000;while(!check()){if(Date.now()>end)throw new Error('Fixture condition timed out');await new Promise(resolve=>setTimeout(resolve,25))}}
const ctx={booking:{id:'booking',bookingReference:'TEST-BOOKING',passengerName:'Fixture Passenger',startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),status:'ACTIVE'},driverId:'linked-driver',accessMethod:'LINK',expiresAt:new Date(Date.now()+3600000).toISOString(),reportingClosesAt:new Date(Date.now()+86400000).toISOString(),trips:[{id:'trip',assignmentVersion:3,pickupLocation:'Station',destination:'Hotel',scheduledAt:current(),scheduledEndAt:current(),vehicle:{registrationNumber:'FIXTURE',displayName:'Test Car'},operationalStatus:'SCHEDULED',startedAt:null,completedAt:null}]};
const session=await browser.newContext({viewport:{width:390,height:844}});
const calls=[],events=[],receipts=new Map();let uncertain=false,deny=false;
const page=await session.newPage();
page.on('pageerror',e=>{throw e});
await session.route('**/api/v1/**',async route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();calls.push({path,method,headers:request.headers(),body:request.postData()});
 const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
 if(path==='/api/v1/auth/me')return respond({user:{accountId:'other',driverId:'other-driver',displayName:'Other Driver',role:'DRIVER'}});
 if(!path.startsWith('/api/v1/driver-link/timeline/'))throw new Error(`Unexpected public request: ${path}`);
 assert.equal(request.headers().authorization,'Bearer fixture-link');assert.equal(request.headers().cookie,undefined);
 if(deny)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'DRIVER_LINK_INVALID',message:'Access unavailable',requestId:'fixture-denial'}})});
 if(path.endsWith('/context'))return respond(ctx);
 if(path.endsWith('/events')&&method==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify({data:events,pagination:{page:1,pageSize:25,total:events.length}})});
 if(path.endsWith('/events')&&method==='POST'){
  const body=request.postDataJSON();const replayed=receipts.has(body.clientEventId);const receipt=receipts.get(body.clientEventId)||{id:`receipt-${receipts.size}`,receivedAt:current(),replayed:false};
  if(!replayed){receipts.set(body.clientEventId,receipt);events.push({...body,id:receipt.id,bookingId:'booking',driverId:'linked-driver',driverNameSnapshot:'Linked Driver',actorAccountId:null,linkId:'fixture',note:body.note||null,location:body.location||null,receivedAt:receipt.receivedAt,backdated:false,accessMethod:'LINK',photos:(body.photoIds||[]).map(id=>({id})),correctsEventId:body.correctsEventId||null,correctionReason:body.correctionReason||null});}
  if(body.type==='TRIP_COMPLETED'){const trip=ctx.trips.find(t=>t.id===body.tripId);trip.operationalStatus='COMPLETED';trip.completedAt=body.occurredAt;}
  if(uncertain){uncertain=false;return route.abort('timedout')}
  return respond({...receipt,replayed},replayed?200:201);
 }
 throw new Error(`Unexpected request: ${path}`);
});
try{
 await session.addCookies([{name:'session',value:'other-driver-session',url:base}]);
 await page.goto(base+'/driver-booking#token=fixture-link');
 await page.getByRole('heading',{name:'TEST-BOOKING',exact:true}).waitFor();
 await page.locator('.driver-primary-action').waitFor();
 await page.screenshot({path:'/tmp/timeline-driver-mobile.png',fullPage:true});assert.equal(new URL(page.url()).hash,'');assert.equal(calls.filter(c=>c.method==='POST').length,0);assert.equal(calls.some(c=>c.path.includes('/auth/')),false);
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).length),0);
 assert.equal(await page.getByLabel('Assignment to update',{exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Clear access session',exact:true}).count(),0);
 await page.getByRole('button',{name:'Post update',exact:true}).click();
 await page.getByLabel('What happened?',{exact:true}).selectOption('DROPPED_OFF');
 assert.equal(await page.getByLabel('Note (optional)').isVisible(),true);
 assert.equal(await page.getByLabel('Photos (optional)').isVisible(),true);
 assert.equal(await page.getByRole('button',{name:'Include my location',exact:true}).count(),0);
 await page.getByRole('button',{name:'Save update',exact:true}).click();
 await page.getByText('Update sent.',{exact:true}).waitFor();
 await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Post update');return button&&!button.disabled});
 assert.equal(await page.getByRole('region',{name:'Saved updates',exact:true}).count(),0);
 assert.equal(events[0].type,'DROPPED_OFF');assert.equal(events.some(e=>e.type==='TRIP_COMPLETED'),false);
 uncertain=true;
 await page.getByRole('button',{name:'Post update',exact:true}).click();
 await page.getByLabel('Note (optional)').fill('Accepted once despite timeout');
 await page.getByRole('button',{name:'Save update',exact:true}).click();
 await page.getByText('Update saved on this device. It will send when connected while this page is open.',{exact:true}).waitFor();
 await page.getByText('1 update waiting to send',{exact:true}).click();
 await page.getByText('General update · Queued',{exact:true}).waitFor();
 await until(()=>events.some(e=>e.note==='Accepted once despite timeout'));const uncertainBody=events.find(e=>e.note==='Accepted once despite timeout');assert.equal(uncertainBody.submissionMode,'ONLINE');
 await page.getByRole('button',{name:'Retry this update',exact:true}).click();
 await page.getByText('Update sent.',{exact:true}).waitFor();
 await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Post update');return button&&!button.disabled});
 assert.equal(await page.getByRole('region',{name:'Saved updates',exact:true}).count(),0);
 const retries=calls.filter(c=>c.method==='POST'&&JSON.parse(c.body).clientEventId===uncertainBody.clientEventId);assert.equal(retries.length,2);assert.equal(retries[0].body,retries[1].body);
 await session.setOffline(true);
 await page.getByRole('button',{name:'Post update',exact:true}).click();
 await page.getByLabel('Note (optional)').fill('Offline device entry');
 await page.getByRole('button',{name:'Save update',exact:true}).click();
 await page.getByText('1 update waiting to send',{exact:true}).waitFor();
 assert.equal(await page.getByText('Offline device entry',{exact:true}).isVisible(),false);
 // The landing HTML is deliberately no-store. Check reload retention while API access is revoked.
 deny=true;await session.setOffline(false);await page.reload();
 await page.getByRole('heading',{name:'Access unavailable',exact:true}).waitFor();
 await page.getByText('Offline device entry',{exact:true}).waitFor();
 deny=false;
 await page.getByText('Booking details & options',{exact:true}).click();
 await page.getByRole('button',{name:'Reload booking',exact:true}).click();
 await page.getByRole('heading',{name:'TEST-BOOKING',exact:true}).waitFor();
 await page.getByRole('button',{name:'Retry this update',exact:true}).click();
 await page.getByRole('region',{name:'Saved updates',exact:true}).waitFor({state:'detached'});
 assert.equal(events.find(e=>e.note==='Offline device entry').submissionMode,'OFFLINE_SYNC');
 await page.getByText('Finish assignment',{exact:true}).click();
 await page.getByRole('button',{name:'Finish all assigned journeys',exact:true}).click();
 assert.equal(await page.getByRole('dialog').getByText('Station → Hotel',{exact:true}).count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 // Repeat whole journey cycles under the same stored trip.
 for(const type of ['TRIP_STARTED','PASSENGER_PICKED_UP','DROPPED_OFF','TRIP_STARTED','PASSENGER_PICKED_UP','DROPPED_OFF']){
  await page.getByRole('button',{name:'Post update',exact:true}).click();
  await page.getByLabel('What happened?',{exact:true}).selectOption(type);
  await page.getByRole('button',{name:'Save update',exact:true}).click();
  await page.getByText('Update sent.',{exact:true}).waitFor();
 await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Post update');return button&&!button.disabled});
 }
 assert.equal(events.filter(e=>e.type==='TRIP_STARTED').length,2);
 assert.equal(events.some(e=>e.type==='TRIP_COMPLETED'),false);
 assert.equal(await page.getByRole('region',{name:'Update history'}).isVisible(),true);
 await page.screenshot({path:'/tmp/timeline-driver-mobile.png',fullPage:true});
 // Completing this assignment leaves another trip independently available.
 ctx.trips.push({...ctx.trips[0],id:'second-trip',destination:'Airport',operationalStatus:'SCHEDULED'});
 await page.getByRole('button',{name:'Reload booking',exact:true}).click();
 await page.getByLabel('Assignment to update',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Finish all assigned journeys',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Finish assignment',exact:true}).isDisabled(),true);
 assert.equal(await page.getByLabel('What happened?',{exact:true}).count(),0);
 await page.getByRole('checkbox',{name:'All journeys for this assignment are finished'}).check();
 await page.getByRole('button',{name:'Finish assignment',exact:true}).click();
 await page.getByText('Update sent.',{exact:true}).waitFor();
 await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Post update');return button&&!button.disabled});
 assert.equal(events.filter(e=>e.type==='TRIP_COMPLETED').length,1);
 assert.equal(ctx.trips[0].operationalStatus,'COMPLETED');
 assert.equal(ctx.trips[1].operationalStatus,'SCHEDULED');
 await page.getByLabel('Assignment to update',{exact:true}).selectOption('second-trip');
 await page.getByRole('button',{name:'Post update',exact:true}).click();
 await page.getByLabel('What happened?',{exact:true}).selectOption('PASSENGER_PICKED_UP');
 await page.getByRole('button',{name:'Save update',exact:true}).click();
 await page.getByText('Update sent.',{exact:true}).waitFor();
 await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Post update');return button&&!button.disabled});
 assert.equal(events.at(-1).tripId,'second-trip');

 deny=true;await page.getByRole('button',{name:'Reload booking',exact:true}).click();await page.getByRole('heading',{name:'Access unavailable',exact:true}).waitFor();
 assert.equal(await page.getByText('Fixture Passenger',{exact:false}).count(),0);assert.equal(await page.getByRole('heading',{name:'Timeline',exact:true}).count(),0);
 const raw=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('feedback-driver-timeline');r.onsuccess=()=>{const q=r.result.transaction('entries').objectStore('entries').getAll();q.onsuccess=()=>resolve(JSON.stringify(q.result));q.onerror=reject};r.onerror=reject}));assert.equal(raw.includes('fixture-link'),false);
 console.log('PASS: mobile public link, cookie isolation, fragment removal, no mount mutations, drop-off, exact replay, offline reload/reconnect, completion confirmation, keyboard dismissal and revoked access privacy.');
 // Feedback admin shell blocks every non-ADMIN role before rendering timeline.
 for(const role of ['CORE_ADMIN','CORE_REPORT_VIEWER','CORE_DATA_ENTRY','CUSTOMER']){
  const isolated=await browser.newContext();const p=await isolated.newPage();let timelineCalls=0;
  await isolated.route('**/api/v1/**',route=>{if(route.request().url().includes('/auth/me'))return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{user:{role,accountId:'fixture',displayName:'Fixture role'}}})});timelineCalls++;return route.fulfill({status:403,body:''})});
  await p.goto(base+'/admin/bookings/detail?bookingId=booking');await p.getByRole('heading',{name:'Workspace unavailable',exact:true}).waitFor();assert.equal(timelineCalls,0);await isolated.close();
 }
 console.log('PASS: core and customer roles cannot render feedback timeline administration.');
 const adminSession=await browser.newContext({viewport:{width:1280,height:900}}),adminPage=await adminSession.newPage();
 const adminCalls=[];let analyticsWithScores=false;
 const overview={tripId:'trip',bookingId:'booking',bookingReference:'TEST-BOOKING',bookingStatus:'ACTIVE',driverId:'linked-driver',driverName:'Linked Driver',assignmentVersion:3,scheduledAt:current(),scheduledEndAt:current(),pickupLocation:'Station',destination:'Hotel',operationalStatus:'UNKNOWN',startedAt:null,completedAt:null,latestUpdate:null,readyToClose:false};
 const driver={id:'linked-driver',displayName:'Linked Driver',driverCode:'FIXTURE',sourceType:'AGENCY',vendorName:null};
 const trip={id:'trip',pickupLocation:'Station',destination:'Hotel',scheduledAt:current(),scheduledEndAt:current(),archivedAt:null,status:'READY',vehicle:ctx.trips[0].vehicle};
 const booking={...ctx.booking,status:'ACTIVE',tourName:null,fileNumber:null,passengerPhone:'+919876543210',notes:null,tripCount:1,engagements:[{id:'engagement',sequenceNumber:1,driver,feedbackPurposes:['DRIVER_FEEDBACK'],status:'READY',archivedAt:null,trips:[trip]}]};
 await adminSession.route('**/api/v1/**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname;adminCalls.push({path,method:r.method(),body:r.postData()});
  const data=value=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:value})});
  if(path==='/api/v1/auth/me')return data({user:{role:'ADMIN',accountId:'admin',displayName:'Admin',driverId:null}});
  if(path==='/api/v1/admin/bookings/booking')return data(booking);
  if(path.endsWith('/feedback-link'))return data({engagementId:'engagement',feedbackLink:base+'/feedback?token=fixture-feedback',feedbackAccessTokenExpiresAt:'2099-01-01',allowMultipleSubmissions:false,recipient:{name:'Fixture Passenger',phone:'+919876543210'}});
  if(path==='/api/v1/admin/timeline/trips'){
   const query=new URL(r.url()).searchParams,page=Number(query.get('page')),pageSize=Number(query.get('pageSize'));
   const all=query.has('bookingId')?[overview]:Array.from({length:6},(_,i)=>({...overview,tripId:`trip-${i}`,bookingReference:`TEST-${i+1}`}));
   return route.fulfill({contentType:'application/json',body:JSON.stringify({data:all.slice((page-1)*pageSize,page*pageSize),pagination:{page,pageSize,total:all.length}})});
  }
  if(path==='/api/v1/admin/analytics'){
   const score={averageScore:4,responseCount:1,answerCount:1};
   return data({overall:analyticsWithScores?score:{averageScore:null,responseCount:0,answerCount:0},negativeFeedbackThreshold:null,negativeFeedbackCount:null,categories:[],drivers:analyticsWithScores?[{...score,driver:{id:'named-driver',displayName:'Ada Driver',sourceType:'AGENCY',vendorName:null}}]:[],sources:[],vendors:analyticsWithScores?[{...score,vendorId:'named-vendor',vendorName:'Mountain Travel'}]:[],monthlyTrend:[],meta:{timezone:'Asia/Kolkata',dateBasis:'SUBMITTED_AT',month:null}});
  }
  if(path.endsWith('/events'))return route.fulfill({contentType:'application/json',body:JSON.stringify({data:[],pagination:{page:1,pageSize:25,total:0}})});
  if(path.endsWith('/link')){if(r.method()==='DELETE')return route.fulfill({status:204});return data({id:'link',bookingId:'booking',driverId:'linked-driver',expiresAt:new Date(Date.now()+86400000).toISOString(),link:base+'/driver-booking/#token=fixture-admin-link'})}
  if(path.endsWith('/progress')){overview.operationalStatus=r.postDataJSON().status;return data({tripId:'trip',status:overview.operationalStatus})}
  throw new Error('Unexpected admin API: '+path);
 });
 adminPage.on('dialog',dialog=>dialog.accept());
 await adminPage.goto(base+'/admin/bookings/detail?bookingId=booking');
 await adminPage.getByRole('tab',{name:'Overview',exact:true}).waitFor();
 assert.equal(await adminPage.getByRole('tab',{name:'Overview',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(adminCalls.some(c=>c.path.includes('/timeline/')),false);
 assert.equal(await adminPage.getByRole('navigation',{name:'admin navigation'}).getByRole('link',{name:'Trip updates',exact:true}).count(),0);
 assert.equal(await adminPage.getByRole('navigation',{name:'admin navigation'}).getByRole('link',{name:'Overview',exact:true}).getAttribute('aria-current'),null);
 await adminPage.getByRole('tab',{name:'Overview',exact:true}).focus();
 await adminPage.keyboard.press('ArrowRight');
 await adminPage.getByRole('heading',{name:'Driver booking links',exact:true}).waitFor();
 assert.equal(await adminPage.getByRole('tab',{name:'Trip updates',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(new URL(adminPage.url()).hash,'#booking-timeline');
 assert.equal(adminCalls.some(c=>c.method==='POST'),false);
 await adminPage.getByText('Progress not recorded',{exact:true}).waitFor();
 await adminPage.getByRole('button',{name:'Issue / refresh access',exact:true}).click();
 await adminPage.getByRole('button',{name:'Copy driver booking link',exact:true}).waitFor();
 assert.equal(adminCalls.find(c=>c.method==='POST').body,'{}');
 await adminPage.getByText('Access options',{exact:true}).click();
 await adminPage.getByLabel('Link expiry (optional, your device timezone)').fill('2099-01-01T12:00');
 await adminPage.getByRole('tab',{name:'Passenger feedback',exact:true}).click();
 await adminPage.getByRole('button',{name:'Share feedback link',exact:true}).waitFor();
 const readsBefore=adminCalls.filter(c=>c.path.includes('/timeline/')).length;
 await adminPage.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await adminPage.waitForTimeout(100);
 assert.equal(adminCalls.filter(c=>c.path.includes('/timeline/')).length,readsBefore);
 await adminPage.getByRole('tab',{name:'Trip updates',exact:true}).click();
 assert.equal(await adminPage.getByLabel('Link expiry (optional, your device timezone)').inputValue(),'2099-01-01T12:00');
 await adminPage.getByRole('button',{name:'Refresh progress',exact:true}).click();
 assert.equal(await adminPage.getByLabel('Link expiry (optional, your device timezone)').inputValue(),'2099-01-01T12:00');
 await adminPage.getByLabel('Link expiry (optional, your device timezone)').fill('');
 await adminPage.getByRole('button',{name:'Regenerate',exact:true}).click();
 assert.equal(adminCalls.filter(c=>c.method==='POST'&&c.path.endsWith('/link')).length,1);
 await adminPage.getByRole('alertdialog').getByRole('button',{name:'Regenerate link',exact:true}).click();
 await adminPage.waitForFunction(()=>document.body.textContent.includes('Access is ready'));
 await adminPage.getByRole('button',{name:'Correct / reopen progress',exact:true}).click();
 assert.equal(await adminPage.getByRole('button',{name:'Confirm progress change',exact:true}).isDisabled(),true);
 await adminPage.getByLabel('Required reason',{exact:true}).fill('Fixture: reopen after assignment change');
 await adminPage.getByRole('checkbox').check();
 await adminPage.getByRole('button',{name:'Confirm progress change',exact:true}).click();
 await adminPage.getByText('Progress updated. Refresh the driver’s booking link so they receive current trip access.',{exact:true}).waitFor();
 const patch=adminCalls.find(c=>c.method==='PATCH');assert.deepEqual(JSON.parse(patch.body),{status:'SCHEDULED',reason:'Fixture: reopen after assignment change'});
 await adminPage.getByRole('button',{name:'Revoke',exact:true}).click();
 await adminPage.getByRole('alertdialog').getByRole('button',{name:'Revoke link',exact:true}).click();
 await adminPage.getByText('Booking link access revoked.',{exact:true}).waitFor();
 await adminPage.screenshot({path:'/tmp/timeline-admin-desktop.png',fullPage:true});
 await adminPage.setViewportSize({width:390,height:844});
 assert.equal(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await adminPage.screenshot({path:'/tmp/timeline-admin-mobile.png',fullPage:true});
 await adminPage.reload();
 await adminPage.getByRole('heading',{name:'Driver booking links',exact:true}).waitFor();
 assert.equal(await adminPage.getByRole('tab',{name:'Trip updates',exact:true}).getAttribute('aria-selected'),'true');
 await adminPage.getByText('More actions',{exact:true}).click();
 await adminPage.getByRole('button',{name:'Mark completed',exact:true}).click();
 assert.equal(adminCalls.some(c=>c.method==='PATCH'&&c.path==='/api/v1/admin/bookings/booking'),false);
 await adminPage.getByRole('alertdialog').getByRole('button',{name:'Cancel',exact:true}).click();
 await adminPage.goto(base+'/admin');
 await adminPage.getByRole('region',{name:'Booking progress summary',exact:true}).getByText('TEST-1',{exact:true}).waitFor();
 const snapshot=adminPage.getByRole('region',{name:'Booking progress summary',exact:true});
 assert.equal(await snapshot.locator('article').count(),5);
 assert.equal(await snapshot.getByRole('button',{name:'Correct / reopen progress',exact:true}).count(),0);
 await snapshot.getByRole('button',{name:'Next',exact:true}).click();
 await snapshot.getByText('TEST-6',{exact:true}).waitFor();
 assert.equal(await snapshot.locator('article').count(),1);
 await snapshot.getByRole('button',{name:'Previous',exact:true}).click();
 await snapshot.getByText('TEST-1',{exact:true}).waitFor();
 await adminPage.setViewportSize({width:1280,height:900});
 await adminPage.screenshot({path:'/tmp/timeline-dashboard-desktop.png',fullPage:true});
 assert.equal(await adminPage.getByRole('heading',{name:'No feedback scores for this view',exact:true}).count(),1);
 analyticsWithScores=true;
 await adminPage.getByRole('button',{name:'Refresh',exact:true}).click();
 await adminPage.locator('#analytics-driver option[value="named-driver"]').waitFor({state:'attached'});
 await adminPage.getByLabel('Driver',{exact:true}).selectOption('named-driver');
 await adminPage.waitForURL(/driverId=named-driver/);
 await adminPage.getByLabel('Vendor',{exact:true}).selectOption('named-vendor');
 await adminPage.waitForURL(/vendorId=named-vendor/);
 assert.equal(await adminPage.getByPlaceholder('UUID',{exact:true}).count(),0);
 await snapshot.getByRole('link',{name:/Open timeline for TEST-1/}).click();
 await adminPage.getByRole('heading',{name:'Driver booking links',exact:true}).waitFor();
 assert.equal(await adminPage.getByRole('tab',{name:'Trip updates',exact:true}).getAttribute('aria-selected'),'true');
 await adminSession.close();
 console.log('PASS: admin booking integration, unknown progress, no automatic link issuance, explicit link issue/regeneration/revocation, reason/confirmation and operational refresh.');
 const loginSession=await browser.newContext({viewport:{width:390,height:844}}),loginPage=await loginSession.newPage();let loginPosts=0;let loginContext={...ctx,driverId:'login-driver',accessMethod:'LOGIN',trips:[{...ctx.trips[0],operationalStatus:'SCHEDULED',startedAt:null,completedAt:null}]};let lastLoginBody;const loginEvents=[];
 loginPage.on('pageerror',e=>{throw e});
 await loginSession.route('**/api/v1/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  const respond=data=>route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
  if(path==='/api/v1/auth/me')return respond({user:{role:'DRIVER',accountId:'login',driverId:'login-driver',displayName:'Login Driver'}});
  assert.equal(path.startsWith('/api/v1/driver/timeline/'),true);assert.equal(request.headers().authorization,undefined);
  if(path.endsWith('/context'))return respond(loginContext);
  if(path.endsWith('/events')&&request.method()==='GET'){const p=Number(new URL(request.url()).searchParams.get('page'));return route.fulfill({contentType:'application/json',body:JSON.stringify({data:loginEvents.slice((p-1)*25,p*25),pagination:{page:p,pageSize:25,total:loginEvents.length}})});}
  if(path.endsWith('/events')){loginPosts++;lastLoginBody=request.postDataJSON();const id=`login-receipt-${loginPosts}`;loginEvents.push({...lastLoginBody,id,driverNameSnapshot:'Login Driver',receivedAt:current(),photos:[],note:lastLoginBody.note||null,location:null});const t=loginContext.trips.find(t=>t.id===lastLoginBody.tripId);if(['TRIP_STARTED','PASSENGER_PICKED_UP'].includes(lastLoginBody.type)){t.operationalStatus='IN_PROGRESS';t.startedAt||=lastLoginBody.occurredAt;}if(lastLoginBody.type==='TRIP_COMPLETED'){t.operationalStatus='COMPLETED';t.completedAt=lastLoginBody.occurredAt;}return respond({id,receivedAt:current(),replayed:false})}
  throw new Error('Unexpected login API: '+path);
 });
 await loginPage.goto(base+'/driver/bookings/detail?bookingId=booking');await loginPage.getByRole('heading',{name:'TEST-BOOKING',exact:true}).waitFor();assert.equal(loginPosts,0);
 await loginPage.getByRole('button',{name:'Post update',exact:true}).click();await loginPage.getByLabel('Note (optional)').fill('Login driver update');assert.equal(await loginPage.getByLabel('Photos (optional)').isVisible(),true);assert.equal(await loginPage.getByLabel('Note (optional)').inputValue(),'Login driver update');await loginPage.getByRole('button',{name:'Save update',exact:true}).click();await loginPage.getByText('Update sent.',{exact:true}).waitFor();assert.equal(loginPosts,1);
 const nav=loginPage.getByRole('navigation',{name:'Driver primary navigation',exact:true});
 const boxes=await nav.getByRole('link').evaluateAll(links=>links.map(link=>({top:link.getBoundingClientRect().top,height:link.getBoundingClientRect().height,width:link.getBoundingClientRect().width})));
 assert.equal(boxes.length,4);assert.equal(new Set(boxes.map(b=>b.top)).size,1);assert.equal(boxes.every(b=>b.height>=44&&b.width>=44),true);
 assert.equal(await loginPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await loginPage.screenshot({path:'/tmp/timeline-driver-login-mobile.png',fullPage:true});
 // Login uses the same repeatable composer, including optional details.
 const ready=()=>loginPage.waitForFunction(()=>{const b=document.querySelector('.driver-primary-action');return b&&!b.disabled});
 for(const type of ['TRIP_STARTED','PASSENGER_PICKED_UP','ARRIVED','DROPPED_OFF','TRIP_STARTED']){
  await ready();
  await loginPage.getByRole('button',{name:'Post update',exact:true}).click();
  await loginPage.getByLabel('What happened?',{exact:true}).selectOption(type);
  assert.equal(await loginPage.getByLabel('Photos (optional)').isVisible(),true);
  const before=loginPosts;
  await loginPage.getByLabel('Note (optional)').fill(`Optional note for ${type}`);
  await loginPage.getByRole('button',{name:'Save update',exact:true}).click();
  await until(()=>loginPosts===before+1);await ready();
  assert.equal(lastLoginBody.note,`Optional note for ${type}`);
 }
 assert.equal(loginPosts,6);
 const beforeMulti=loginPosts;
 loginContext={...loginContext,trips:[{...loginContext.trips[0],operationalStatus:'COMPLETED',completedAt:current()}, {...loginContext.trips[0],id:'active-trip',pickupLocation:'Airport',operationalStatus:'IN_PROGRESS',startedAt:current()}]};
 await loginPage.reload();await loginPage.getByLabel('Assignment to update',{exact:true}).waitFor();
 assert.equal(await loginPage.getByLabel('Assignment to update',{exact:true}).inputValue(),'active-trip');
 await ready();
 await loginPage.getByText('Finish assignment',{exact:true}).click();
 await loginPage.getByRole('button',{name:'Finish all assigned journeys',exact:true}).click();
 assert.equal(loginPosts,beforeMulti);
 await loginPage.getByRole('dialog').getByText('Airport → Hotel',{exact:true}).waitFor();
 await loginPage.waitForFunction(()=>document.activeElement?.id==='composer-title');
 assert.equal(await loginPage.getByRole('button',{name:'Finish assignment',exact:true}).isDisabled(),true);
 await loginPage.getByRole('checkbox',{name:'All journeys for this assignment are finished'}).check();
 await loginPage.getByRole('button',{name:'Finish assignment',exact:true}).focus();await loginPage.keyboard.press('Tab');
 assert.equal(await loginPage.getByRole('checkbox').evaluate(el=>el===document.activeElement),true);
 await loginPage.getByRole('button',{name:'Finish assignment',exact:true}).click();
 await until(()=>loginPosts===beforeMulti+1);await ready();
 assert.equal(lastLoginBody.tripId,'active-trip');assert.equal(lastLoginBody.type,'TRIP_COMPLETED');assert.equal(lastLoginBody.note,undefined);
 await loginPage.getByLabel('Assignment to update',{exact:true}).selectOption('trip');
 await loginPage.getByRole('button',{name:'Post update',exact:true}).click();
 assert.deepEqual(await loginPage.getByLabel('What happened?',{exact:true}).locator('option').allTextContents(),['General update']);
 await loginPage.keyboard.press('Escape');
 await loginSession.close();
 console.log('PASS: shared login screen, optional details, mobile navigation, multiple-trip selection, repeatable journey updates and separate final completion.');
}finally{await browser.close()}
