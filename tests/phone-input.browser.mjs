// All requests are mocked: verify the shared phone field in admin and driver forms.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.FEEDBACK_PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_EXECUTABLE?{executablePath:process.env.FEEDBACK_BROWSER_EXECUTABLE}:{})});
const base=process.env.FEEDBACK_PREVIEW_URL||'http://localhost:3000';
async function checkPhone(page,label,name){
 const number=page.getByLabel(label,{exact:true}),code=page.getByLabel(`${label.replace(" (optional)", "")} country code`,{exact:true});
 await number.waitFor();assert.equal(await code.inputValue(),'+91');
 for(const [raw,prefix,local] of [
  ['98765 43210','+91','9876543210'],
  ['919876543210','+91','9876543210'],
  ['+91 98765 43210','+91','9876543210'],
  ['0091 98765 43210','+91','9876543210'],
  ['14155552671','+1','4155552671'],
  ['442079460958','+44','2079460958'],
  ['3811234567890','+381','1234567890'],
 ]){
  await number.fill(raw);await number.press('Tab');
  assert.equal(await code.inputValue(),prefix);
  assert.equal(await number.inputValue(),local);
  assert.equal(await page.locator(`input[type="hidden"][name="${name}"]`).inputValue(),prefix+local);
  await page.getByText(`Number to use: ${prefix}${local}`,{exact:true}).waitFor();
 }
 await code.fill('+91');await code.press('Tab');await number.fill('9876543210');await number.press('Tab');
 await code.fill('+44');await code.press('Tab');
 assert.equal(await number.inputValue(),'9876543210');
 assert.equal(await page.locator(`input[type="hidden"][name="${name}"]`).inputValue(),'+449876543210');
 // Manual code edits persist while the local number is corrected.
 await number.fill('2079460958');await number.press('Tab');
 assert.equal(await code.inputValue(),'+44');
 assert.equal(await page.locator(`input[type="hidden"][name="${name}"]`).inputValue(),'+442079460958');
 await number.fill('');await number.press('Tab');
 assert.equal(await page.locator(`input[type="hidden"][name="${name}"]`).inputValue(),'');
 await number.fill('+91x9876543210');await number.press('Tab');assert.equal(await number.getAttribute('aria-invalid'),'true');
 await number.fill('919876543210');await number.press('Tab');
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.locator('.phone-input-row input').evaluateAll(inputs=>inputs.every(input=>{const rect=input.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth})),true);
 }
 await page.setViewportSize({width:390,height:844});
}
try{
 for(const role of ['admin','driver']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let submitted;
  const profile={accountId:'test-driver',displayName:'Test Driver',email:'driver@example.com',role:'DRIVER',phone:null,status:'ACTIVE',driverCode:'D1',sourceType:'AGENCY',timeZone:'Asia/Kolkata',assignmentEnabled:true,maxDailyDutyMinutes:480};
  await context.route('**/api/v1/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   const respond=data=>route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
   if(path.endsWith('/auth/me'))return respond({user:{accountId:'test',displayName:'Test User',role:role.toUpperCase()}});
   if(path.endsWith('/driver/profile')){
    if(request.method()==='PATCH'){submitted=request.postDataJSON();return respond({...profile,...submitted})}
    return respond(profile);
   }
   if(path.endsWith('/admin/bookings')&&request.method()==='POST'){
    submitted=request.postDataJSON();
    return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'TEST_BOOKING_EXISTS',message:'Test booking already exists.'}})});
   }
   throw new Error(`Unexpected request ${path}`);
  });
  await page.goto(base+(role==='admin'?'/admin/bookings/new':'/driver/profile'));
  await checkPhone(page,role==='admin'?'WhatsApp number':'Phone (optional)',role==='admin'?'passengerPhone':'phone');
  if(role==='admin'){
   await page.getByLabel('Booking reference',{exact:true}).fill('TEST');await page.getByLabel('Passenger name',{exact:true}).fill('Test Passenger');
   await page.getByLabel('Booking starts',{exact:true}).fill('2026-11-02T10:00');await page.getByLabel('Booking ends',{exact:true}).fill('2026-11-02T11:00');
   await page.getByRole('button',{name:'Create booking',exact:true}).click();await page.getByText('Test booking already exists.',{exact:true}).first().waitFor();
   assert.equal(submitted.passengerPhone,'+919876543210');
  }else{
   await page.locator('.phone-field').evaluate(field=>field.scrollIntoView({block:'center'}));await page.locator('.phone-field').screenshot({path:'/tmp/phone-input-preview.png'});await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByText('Profile saved.',{exact:true}).waitFor();assert.equal(submitted.phone,'+919876543210');
  }
  await context.close();
 }
 console.log('PASS: admin and driver default +91, bare prefixes, explicit codes, editable code, clearing, invalid input, mobile layout and submitted phone payloads.');
}finally{await browser.close()}
