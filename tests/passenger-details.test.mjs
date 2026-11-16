import test from 'node:test';
import assert from 'node:assert/strict';
import {passengerDetailsErrors,passengerRespondent} from '../lib/passenger-details.ts';
const details={name:'',phone:'9876543210',email:'',consent:true};
test('passenger details require mobile and consent while contact fields may be omitted',()=>{
 assert.deepEqual(passengerDetailsErrors(details),{});
 assert.deepEqual(passengerRespondent(details,'2026-11-02T00:00:00Z'),{phone:'+919876543210',consentAccepted:true,consentedAt:'2026-11-02T00:00:00Z'});
 assert.ok(passengerDetailsErrors({...details,phone:''}).phone);
 assert.ok(passengerDetailsErrors({...details,consent:false}).consent);
 assert.throws(()=>passengerRespondent({...details,consent:false},'now'),/consent/);
});
test('optional fields are validated only when supplied and are trimmed in payloads',()=>{
 assert.ok(passengerDetailsErrors({...details,email:'bad-address'}).email);
 assert.ok(passengerDetailsErrors({...details,name:'x'.repeat(201)}).name);
 const supplied={...details,name:' Traveller ',email:' a@example.com '};
 assert.deepEqual(passengerDetailsErrors(supplied),{});
 assert.deepEqual(passengerRespondent(supplied,'now'),{phone:'+919876543210',name:'Traveller',email:'a@example.com',consentAccepted:true,consentedAt:'now'});
});
