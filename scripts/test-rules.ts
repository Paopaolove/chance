// Harnais règles Moment — lancer : npm run test:rules (Node 22). Voir scripts/run-test-rules.cjs.
// @ts-nocheck
// Harnais = environnement de développement (Expo Go / Metro) : __DEV__ vrai. Le garde démo est testé plus bas avec __DEV__ = false.
(globalThis as any).__DEV__ = true;
import * as G from '../src/utils/parisGeo';
import { __reducer as R, __initial as I } from '../src/data/ChanceContext';
import * as OA from '../src/utils/outingActive';
import * as P from '../src/utils/partners';
import * as C from '../src/utils/chat';
import * as PR from '../src/data/pricing';
import * as MP from '../src/utils/momentPhotos';
import { parseFreeDate } from '../src/utils/freeDate';
import { parisWallToUtc, isParisTomorrow, nextParisMidnight } from '../src/utils/parisTime';
let pass=0, fail=0; const ok=(c:any,m:string)=>{c?pass++:(fail++,console.log('FAIL',m));};
const H=3600e3, now=Date.now(), iso=(ms:number)=>new Date(ms).toISOString();
const me:any={id:'u1',firstName:'Moi',gender:'femme',plan:'essai'};
const host:any={id:'h1',firstName:'Hôte'};
const o=(x:any={}):any=>({id:'o1',hostId:'h1',hostName:'Hôte',status:'open',capacity:2,spotsLeft:2,startsAt:iso(now+5*H),category:'resto',budgetMaxEuros:20,neighborhood:'X',...x});
const rq=(x:any={}):any=>({id:'r1',outingId:'o1',userId:'u1',userName:'Moi',status:'pending',createdAt:iso(now),...x});
const S=(x:any={}):any=>({...I,currentUser:me,outings:[o()],requests:[],momentPhotos:[],...x});
const freeze=(s:any)=>{const f=(v:any)=>{if(v&&typeof v==='object'){Object.freeze(v);Object.values(v).forEach(f);}return v;};return f(s);};
const D=(s:any,a:any)=>R(freeze(s),a);
// join / accept / confirm
let s=D(S(),{type:'JOIN_OUTING',payload:rq()}); ok(s.requests.length===1,'join');
ok(D(S({currentUser:{...me,gender:undefined},outings:[o({womenOnly:true})]}),{type:'JOIN_OUTING',payload:rq()}).requests.length===0,'unknown gender women-only');
ok(D(S({outings:[o({startsAt:iso(now-60e3)})]}),{type:'JOIN_OUTING',payload:rq()}).requests.length===0,'join past start (reducer)');
ok(D(S({outings:[o({hostId:'u1'})]}),{type:'JOIN_OUTING',payload:rq()}).requests.length===0,'join own outing (reducer)');
s=D(s,{type:'ACCEPT_REQUEST',payload:{requestId:'r1',acceptedAt:iso(now),confirmDeadlineAt:iso(now+10*60e3)}});
ok(s.requests[0].status==='accepted'&&s.outings[0].spotsLeft===1,'accept');
let late=D(s,{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now+11*60e3)}});
ok(late.requests[0].status==='expired'&&late.outings[0].spotsLeft===2,'10 min expiry restores seat');
s=D(s,{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now+60e3)}});
ok(s.requests[0].status==='confirmed'&&s.requests[0].depositStatus==='held','confirm holds caution');
ok(D(s,{type:'DECLINE_REQUEST',payload:{requestId:'r1'}}).requests[0].status==='confirmed','decline must not hit confirmed');
// cancel windows
ok(D(s,{type:'CANCEL_REQUEST',payload:{requestId:'r1',cancelledAt:iso(now),by:'guest'}}).requests[0].depositStatus==='returned','cancel ≥3h returned');
ok(D(s,{type:'CANCEL_REQUEST',payload:{requestId:'r1',cancelledAt:iso(now+3*H),by:'guest'}}).requests[0].depositStatus==='forfeited','late cancel forfeited');
ok(D(s,{type:'CANCEL_OUTING',payload:{outingId:'o1'}}).requests[0].depositStatus==='returned','host cancel returns');
ok(PR.DEPOSIT_FORFEIT_CHANCE_EUROS+PR.DEPOSIT_FORFEIT_HOST_EUROS===20,'split 6.90+13.10');
// complete + present + photos
let c=D(s,{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'auto',at:iso(now+5*H+30*60e3)}}); ok(c.requests[0].attendance===undefined,'complete ≠ present');
ok(MP.momentParticipants(c.outings[0],c.requests).length===0,'no participants without presence');
ok(D(c,{type:'ADD_MOMENT_PHOTO',payload:{id:'p0',outingId:'o1',uploaderId:'zz',uri:'x',createdAt:iso(now),consents:{}}}).momentPhotos.length===0,'non-participant photo (reducer)');
c=D(c,{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now+5*H)}}); ok(c.requests[0].depositStatus==='returned','present returns');
ok(D(s,{type:'ADD_MOMENT_PHOTO',payload:{id:'p0',outingId:'o1',uploaderId:'u1',uri:'x',createdAt:iso(now),consents:{h1:'pending'}}}).momentPhotos.length===0,'no photo before terminée');
let ph=c; for(const i of [1,2,3]) ph=D(ph,{type:'ADD_MOMENT_PHOTO',payload:{id:'p'+i,outingId:'o1',uploaderId:'u1',uri:'x',createdAt:iso(now),consents:{h1:'pending'}}});
ok(ph.momentPhotos.length===2,'max 2 photos');
ok(MP.momentPhotoStatus(ph.momentPhotos[0],ph.outings[0],ph.requests)==='pending','pending');
ph=D(ph,{type:'SET_MOMENT_PHOTO_CONSENT',payload:{photoId:'p1',userId:'h1',consent:'accepted'}});
ok(MP.momentPhotoStatus(ph.momentPhotos[0],ph.outings[0],ph.requests)==='published','published after consent');
// one active announcement
ok(!P.canPartnerOrUserCreateOuting(host,iso(now+48*H),[o()],[]).ok,'1 active');
ok(P.canPartnerOrUserCreateOuting(host,iso(now+48*H),[o({status:'completed'})],[]).ok,'completed frees slot');
// urgent window / feed
const u=o({urgentOnSite:true,startsAt:iso(now-20*60e3)});
ok(OA.isVisibleOnAnnoncesFeed(u)&&OA.isOutingAcceptingRequests(u),'urgent visible H+20');
ok(!OA.isVisibleOnAnnoncesFeed(o({urgentOnSite:true,startsAt:iso(now-31*60e3)})),'urgent hidden H+31');
ok(!OA.isVisibleOnAnnoncesFeed(o({startsAt:iso(now-60e3)})),'normal hidden after start');
ok(OA.shouldAutoPromoteUrgent(o({startsAt:iso(now+80*60e3)}),[]),'auto urgent H-90');
// chat
ok(!C.isChatUnlocked(iso(now+2*H),now)&&C.isChatUnlocked(iso(now+50*60e3),now),'chat H-1');
ok(C.isChatUnlocked(iso(now+5*H),now,C.chatUnlockOptsFor({isPartnerListing:true})),'partner chat at confirm');
// partner auto seat
const po=o({isPartnerListing:true,capacity:1,spotsLeft:1});
let ps=S({outings:[po],requests:[rq({status:'accepted',partnerAutoSeat:true,confirmDeadlineAt:iso(now+600e3)}),rq({id:'r2',userId:'u2',status:'accepted',partnerAutoSeat:true,confirmDeadlineAt:iso(now+600e3)})]});
ps=D(ps,{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now)}});
ok(ps.outings[0].status==='closed'&&ps.requests[1].partnerNoSpot,'partner full → closed + plus de place');
ok(D(S({outings:[po],requests:[rq()]}),{type:'ACCEPT_REQUEST',payload:{requestId:'r1'}}).requests[0].status==='pending','no accept on partner');
ok(P.nextPartnerWarningState(1).closed&&!P.nextPartnerWarningState(0).closed,'2nd warning closes');
// dates
const t=parseFreeDate('12/10',Date.parse('2026-10-09T10:00:00Z')); ok(t.ok&&(t as any).ymd==='2026-10-12','JJ/MM');
const t2=parseFreeDate('01/01',Date.parse('2026-10-09T10:00:00Z')); ok(t2.ok&&(t2 as any).ymd==='2027-01-01','rollover');
ok(parisWallToUtc('2026-10-25',20,0).toISOString()==='2026-10-25T19:00:00.000Z','DST oct');
ok(parisWallToUtc('2026-03-29',20,0).toISOString()==='2026-03-29T18:00:00.000Z','DST mar');
ok(isParisTomorrow('2026-10-10T08:00:00Z',Date.parse('2026-10-09T22:30:00Z'))===false,'23h30 Paris: tomorrow = 11 oct');
ok(nextParisMidnight(new Date('2026-10-24T23:30:00Z')).toISOString()==='2026-10-25T23:00:00.000Z','midnight DST day');
// fil avant le compte : pas de demande / publication sans compte (reducer)
ok(D(S({currentUser:null}),{type:'JOIN_OUTING',payload:rq()}).requests.length===0,'guest cannot join (reducer)');
ok(D(S({currentUser:null,outings:[]}),{type:'CREATE_OUTING',payload:o({id:'o9',hostId:'u1'})}).outings.length===0,'guest cannot propose (reducer)');
ok(D(S({slidesSeen:false,currentUser:null}),{type:'SEE_SLIDES'}).slidesSeen===true&&I.slidesSeen===false&&I.onboardingDone===false,'slides seen ≠ account');
// hôte à table seulement s’il est venu
ok(MP.momentParticipants(c.outings[0],c.requests).some((p:any)=>p.userId==='h1'),'host present counted');
ok(!MP.momentParticipants({...c.outings[0],hostNoShowReported:true},c.requests).some((p:any)=>p.userId==='h1'),'host no-show not at table');
ok(MP.momentParticipants({...c.outings[0],hostNoShowReported:true},c.requests).length===0,'guest alone after host no-show: no shared moment');
// carte : bornes Paris + coordonnées dérivées
{const a=G.outingCoords({id:'m1',neighborhood:'Montmartre'})!, b=G.outingCoords({id:'m1',neighborhood:'Montmartre'})!, c=G.outingCoords({id:'m2',neighborhood:'Montmartre'})!;
ok(!!a&&G.isInParis(a)&&a.latitude===b.latitude&&(a.latitude!==c.latitude||a.longitude!==c.longitude),'geo: quartier → coords déterministes, décalées');
ok(G.outingCoords({id:'x',neighborhood:'Versailles'})===null&&G.outingCoords({id:'x',neighborhood:'X',latitude:48.9,longitude:2.6})===null&&!G.isInParis({latitude:48.80,longitude:2.35}),'geo: hors Paris exclu');
const r=G.clampRegion({latitude:49.5,longitude:2.35,latitudeDelta:1,longitudeDelta:1}); ok(r.latitudeDelta<=G.PARIS_MAX_DELTA&&G.isInParis(r),'geo: pas de vue 100 km');}

// audit guards (fb14e0f lot)
ok(Number.isNaN(parisWallToUtc('2027-03-28',2,30).getTime()),'DST spring gap refused');
ok(parisWallToUtc('2026-10-25',2,30).toISOString()==='2026-10-25T00:30:00.000Z','DST autumn earlier instant');
const feb=parseFreeDate('29/02',Date.parse('2028-03-01T10:00:00Z')); ok(!feb.ok&&(feb as any).reason==='invalid','29/02 rollover revalidated');
{
  const start=iso(now);
  const uo=o({urgentOnSite:true,startsAt:start,status:'open'});
  const late=iso(now+31*60e3);
  const s0=S({outings:[uo],requests:[rq({status:'accepted',confirmDeadlineAt:iso(now+600e3)})]});
  const s1=D(s0,{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:late}});
  ok(s1.requests[0].status==='accepted','urgent confirm after H+30 refused');
}
{
  const start=iso(now+60*60e3); // H in 1h → before H−15
  const s0=S({outings:[o({startsAt:start})],requests:[rq({status:'confirmed',depositStatus:'held'})]});
  const s1=D(s0,{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now)}});
  ok(s1.requests[0].attendance!=='present'&&s1.requests[0].depositStatus==='held','presence before H−15 refused');
  const s2=D(s0,{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now+50*60e3)}});
  ok(s2.requests[0].attendance==='present'&&s2.requests[0].depositStatus==='held','presence from H−15 ok (caution retenue jusqu’à H+30)');
  ok(D(s2,{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'auto',at:iso(now+90*60e3)}}).requests[0].depositStatus==='returned','present: returned at end (H+30)');
  ok(D(s0,{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now+90*60e3)}}).requests[0].depositStatus==='returned','presence marked at H+30 returns now');
}
{
  const guest:any={...me,plan:'payg',outingCredits:1};
  const s0=S({currentUser:guest,requests:[rq({status:'accepted',confirmDeadlineAt:iso(now+600e3)}),rq({id:'r2',userId:'u1',status:'accepted',confirmDeadlineAt:iso(now+600e3)})]});
  const s1=D(s0,{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now),consumeCredit:true}});
  ok(s1.requests[0].status==='confirmed'&&(s1.currentUser.outingCredits??0)===0,'credit consumed on first confirm');
  const s2=D(s1,{type:'CONFIRM_SLOT',payload:{requestId:'r2',confirmedAt:iso(now),consumeCredit:true}});
  ok(s2.requests[1].status==='accepted'&&(s2.currentUser.outingCredits??0)===0,'second confirm refused without credit');
}
{
  const start=iso(now+60*60e3);
  const s0=S({outings:[o({startsAt:start})],requests:[rq({status:'confirmed',depositStatus:'held'})]});
  const s1=D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(now)}});
  ok(s1.requests[0].attendance!=='absent'&&s1.requests[0].depositStatus==='held','no-show before H refused');
}
ok(OA.isPresenceWindowOpen(o({startsAt:iso(now)}),now)&&!OA.isPresenceWindowOpen(o({startsAt:iso(now+20*60e3)}),now),'presence window helper');

// lot « Je quitte la table » + joker avant H
{
  const st=(startOffMs:number,x:any={})=>S({outings:[o({startsAt:iso(now+startOffMs),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held',...x})]});
  const L=(s0:any,atMs:number,reason?:any,id='lv1')=>D(s0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(atMs),reason,reportId:id}});
  // 3. avant H+30 sans motif → perdue
  let a=L(st(-10*60e3),now); ok(a.requests[0].depositStatus==='forfeited'&&a.requests[0].leftTableEarly===true&&a.confidentialLeaveReports.length===0,'leave <H+30 no reason forfeited');
  ok(PR.DEPOSIT_FORFEIT_CHANCE_EUROS===6.9&&PR.DEPOSIT_FORFEIT_HOST_EUROS===13.1,'leave split 6.90/13.10');
  // 6. après H+30 → libre
  let b=L(st(-31*60e3),now); ok(b.requests[0].depositStatus==='returned'&&!b.requests[0].leftTableEarly,'leave ≥H+30 free');
  ok(L(st(-30*60e3),now).requests[0].depositStatus==='returned','leave exactly H+30 free');
  // 4. malaise → rendue + signalement confidentiel, hôte ne voit pas le motif
  let c=L(st(-5*60e3),now,'discomfort');
  ok(c.confidentialLeaveReports.length===1&&c.confidentialLeaveReports[0].guestDepositRefundedEuros===20&&c.requests[0].leftTableEarly===true,'discomfort: guest refunded 20 € (confidential) + report');
  // hôte : même indicateur avec ou sans malaise
  const hostView=(r:any)=>({leftTableAt:!!r.leftTableAt,leftTableEarly:r.leftTableEarly,attendance:r.attendance});
  ok(JSON.stringify(hostView(c.requests[0]))===JSON.stringify(hostView(L(st(-5*60e3),now).requests[0])),'host indicator identical with/without discomfort');
  ok(L(st(-40*60e3),now,'discomfort').requests[0].leftTableEarly===undefined&&L(st(-40*60e3),now).requests[0].leftTableEarly===undefined,'after H+30: same indicator both');
  ok(!('reason' in c.requests[0])&&!JSON.stringify(require('../src/utils/leaveTable').projectRequestForHost(c.requests[0])).includes('discomfort'),'host-visible (projected) request has no motive');
  ok(c.confidentialLeaveReports[0].hostId==='h1'&&c.confidentialLeaveReports[0].guestId==='u1'&&!c.currentUser.manualReviewRequired,'report fields, no review after 1');
  // pas avant H, pas deux fois, pas l’hôte, pas un autre
  ok(L(st(10*60e3),now).requests[0].leftTableAt===undefined,'no leave before H');
  ok(L(a,now+60e3).requests[0].depositStatus==='forfeited'&&L(a,now+60e3).requests[0].leftTableAt===a.requests[0].leftTableAt,'leave idempotent');
  ok(L({...st(-5*60e3),currentUser:{...me,id:'h1'}},now).requests[0].leftTableAt===undefined,'host cannot leave as guest');
  ok(L(st(-5*60e3,{status:'cancelled'}),now).requests[0].leftTableAt===undefined,'cancelled request cannot leave');
  // présent / caution déjà rendue → jamais re-perdue
  // caution déjà rendue par une autre voie (joker, imprévu accepté…) : jamais re-perdue
  ok(L(st(-5*60e3,{depositStatus:'returned'}),now).requests[0].depositStatus==='returned','already-returned deposit not re-forfeited');
  // invité présent qui part sans motif avant H+30 → perdue ; via MARK_GUEST_PRESENT réel
  {
    const p0=D(st(-5*60e3),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now-60e3)}});
    ok(p0.requests[0].attendance==='present'&&p0.requests[0].depositStatus==='held','present before H+30: held');
    ok(L(p0,now).requests[0].depositStatus==='forfeited','present guest leaving <H+30 no reason forfeited');
    ok(L(p0,now,'discomfort').confidentialLeaveReports[0].guestDepositRefundedEuros===20,'present guest leaving with discomfort refunded');
    const p1=D(st(-40*60e3),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now)}});
    ok(p1.requests[0].depositStatus==='returned'&&L(p1,now).requests[0].depositStatus==='returned','present after H+30: returned, leave free');
    // partenaire : arrivée avant H+30 → retenue, départ sans motif → perdue
    const pa=D(S({outings:[o({startsAt:iso(now-5*60e3),isPartnerListing:true,status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})]}),{type:'GUEST_ARRIVED_PARTNER',payload:{requestId:'r1',arrivedAt:iso(now)}});
    ok(pa.requests[0].attendance==='present'&&pa.requests[0].depositStatus==='held'&&L(pa,now).requests[0].depositStatus==='forfeited','partner arrival <H+30 held, early leave forfeited');
  }
  // départ exactement à H : autorisé, avant H+30 → perdue sans motif
  { const h0=L(st(0),now); ok(!!h0.requests[0].leftTableAt&&h0.requests[0].depositStatus==='forfeited','leave exactly at H allowed, forfeited'); }
  ok(L(st(-1),now-2).requests[0].leftTableAt===undefined,'leave 1 ms before H refused');
  ok(L(st(-5*60e3),now).requests[0].leftTableAt&&L({...st(-5*60e3),outings:[o({startsAt:iso(now-5*60e3),status:'completed'})]},now).requests[0].leftTableAt===undefined,'no leave on completed moment');
  // 5. deux malaises en 3 mois → revue manuelle, motif plus proposé
  const prior={id:'old',outingId:'o0',requestId:'r0',guestId:'u1',hostId:'h2',reason:'discomfort',createdAt:iso(now-40*24*H)};
  let d=L({...st(-5*60e3),confidentialLeaveReports:[prior]},now,'discomfort');
  ok(d.currentUser.manualReviewRequired===true&&d.confidentialLeaveReports.length===2&&d.confidentialLeaveReports[0].guestDepositRefundedEuros===20,'2nd discomfort → manual review');
  const LT=require('../src/utils/leaveTable');
  ok(!LT.isDiscomfortReasonOffered(d.confidentialLeaveReports,'u1',d.currentUser.manualReviewRequired,now),'discomfort no longer offered');
  let e=L({...st(-5*60e3),currentUser:{...me,manualReviewRequired:true},confidentialLeaveReports:[prior,{...prior,id:'o2'}]},now,'discomfort');
  ok(e.requests[0].depositStatus==='forfeited'&&e.confidentialLeaveReports.length===2,'discomfort refused when not offered → normal rule');
  ok(LT.isDiscomfortReasonOffered([{...prior,createdAt:iso(now-100*24*H)}],'u1',false,now)&&LT.countRecentDiscomfort([{...prior,createdAt:iso(now-100*24*H)}],'u1',now)===0,'discomfort older than 3 months ignored');
  ok(LT.countRecentDiscomfort([{...prior,concreteEvidence:true}],'u1',now)===0,'concrete evidence not counted');
  // bornes fenêtre 3 mois (calendrier Paris, jour compris)
  {
    const N=Date.parse('2026-10-16T10:00:00Z'), rp=(d:string)=>({...prior,createdAt:d});
    ok(LT.parisYmdMonthsAgo(N,3)==='2026-07-16','3 months ago = 16/07');
    ok(LT.countRecentDiscomfort([rp('2026-07-16T08:00:00Z')],'u1',N)===1,'window start day included');
    ok(LT.countRecentDiscomfort([rp('2026-07-15T21:00:00Z')],'u1',N)===0,'day before window excluded (23h Paris)');
    ok(LT.countRecentDiscomfort([rp('2026-07-15T22:30:00Z')],'u1',N)===1,'00h30 Paris on start day included');
    // fin de mois : 31/05 → 03/03 (pas 28/02)
    const M=Date.parse('2026-05-31T10:00:00Z');
    ok(LT.parisYmdMonthsAgo(M,3)==='2026-03-03','31/05 − 3 mois = 03/03');
    ok(LT.countRecentDiscomfort([rp('2026-02-28T12:00:00Z')],'u1',M)===0&&LT.countRecentDiscomfort([rp('2026-03-02T12:00:00Z')],'u1',M)===0,'end of month: 28/02 and 02/03 excluded');
    ok(LT.countRecentDiscomfort([rp('2026-03-03T12:00:00Z')],'u1',M)===1,'end of month: 03/03 included');
    ok(LT.parisYmdMonthsAgo(Date.parse('2026-01-15T10:00:00Z'),3)==='2025-10-15','year rollover');
    ok(LT.parisYmdMonthsAgo(Date.parse('2026-08-31T10:00:00Z'),3)==='2026-05-31','31/08 → 31/05');
  }
  // 1. joker seulement avant H, refusé si présent
  const jk=(startOffMs:number,x:any={},usedAt=now)=>D(S({outings:[o({startsAt:iso(now+startOffMs)})],requests:[rq({status:'confirmed',depositStatus:'held',...x})],imprevuReports:[{id:'i1',outingId:'o1',requestId:'r1',reporterId:'u1',reporterName:'Moi',responderIds:['h1'],motive:'autre',reason:'x',status:'refused',createdAt:iso(now)}]}),{type:'USE_JOKER_ON_IMPREVU',payload:{imprevuId:'i1',requestId:'r1',monthKey:'2099-01',usedAt:iso(usedAt)}});
  ok(jk(60*60e3).requests[0].depositStatus==='returned'&&jk(60*60e3).imprevuReports[0].jokerUsed===true,'joker before H ok');
  ok(jk(-60e3).requests[0].depositStatus==='held'&&!jk(-60e3).imprevuReports[0].jokerUsed,'joker after start refused');
  ok(jk(0).requests[0].depositStatus==='held','joker at H refused');
  ok(jk(60*60e3,{attendance:'present'}).requests[0].depositStatus==='held','joker refused when present');
  ok(jk(60*60e3,{guestArrivedAt:iso(now)}).requests[0].depositStatus==='held','joker refused when arrived');
}

// décision (b) : vue hôte identique, ligne payée par Moment pour le malaise seulement
{
  const LT=require('../src/utils/leaveTable');
  const st=(off:number,x:any={})=>S({outings:[o({startsAt:iso(now+off),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held',...x})]});
  const L=(s0:any,at:number,reason?:any)=>D(s0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(at),reason,reportId:'lv'}});
  const a=L(st(-5*60e3),now), b=L(st(-5*60e3),now,'discomfort');
  // tout ce qui est visible par l’hôte : la demande entière (hors ids), sa vue dérivée, les gains
  const hostSees=(s:any)=>JSON.stringify({req:LT.projectRequestForHost(s.requests[0]),view:LT.hostLeaveView(s.requests[0]),outing:s.outings[0]});
  ok(hostSees(a)===hostSees(b),'host sees identical request/view/outing with or without discomfort');
  ok(LT.hostDepositStatus(a.requests[0])===LT.hostDepositStatus(b.requests[0])&&LT.hostDepositStatus(b.requests[0])==='forfeited','projected depositStatus identical for host (forfeited)');
  ok(LT.hostLeaveView(a.requests[0]).label==='Moi a quitté la table'&&LT.hostLeaveView(b.requests[0]).earningsEuros===13.1&&LT.hostLeaveView(a.requests[0]).earningsEuros===13.1,'host: « X a quitté la table » + 13,10 € both');
  ok(b.momentPaidHostLines.length===1&&b.momentPaidHostLines[0].amountEuros===13.1&&b.momentPaidHostLines[0].momentKeepsEuros===0&&b.momentPaidHostLines[0].hostId==='h1','discomfort: line paid by Moment 13,10 €, Moment keeps 0');
  ok(a.momentPaidHostLines.length===0,'no Moment-paid line without discomfort');
  ok(!hostSees(b).includes('leave_discomfort')&&!hostSees(b).includes('discomfort'),'Moment-paid line absent from host view');
  ok(b.confidentialLeaveReports[0].guestDepositRefundedEuros===20&&a.confidentialLeaveReports.length===0,'guest deposit fully refunded (discomfort only)');
  const a2=L(st(-40*60e3),now), b2=L(st(-40*60e3),now,'discomfort');
  ok(hostSees(a2)===hostSees(b2)&&a2.requests[0].depositStatus==='returned'&&LT.hostLeaveView(b2.requests[0]).earningsEuros===0&&b2.momentPaidHostLines.length===0,'after H+30: identical, no host share, no Moment line');
}
// imprévu d’un invité présent / no-show présent ou parti / clôture avant H+30
{
  const imp=(x:any={})=>({id:'i1',outingId:'o1',requestId:'r1',reporterId:'u1',reporterName:'Moi',responderIds:['h1'],motive:'autre',reason:'x',status:'pending',createdAt:iso(now),...x});
  const base=(off:number,rx:any={})=>S({outings:[o({startsAt:iso(now+off),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held',...rx})],imprevuReports:[imp()]});
  const auto=(s0:any)=>D(s0,{type:'RESPOND_IMPREVU',payload:{imprevuId:'i1',decision:'auto_refused',respondedAt:iso(now),forfeitReporterDeposit:true}});
  const p=D(base(10*60e3),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now)}});
  ok(p.requests[0].attendance==='present'&&p.requests[0].depositStatus==='held','imprévu guest marked present H−10: held');
  const pa=auto(p); ok(pa.requests[0].depositStatus==='held'&&pa.imprevuReports[0].status==='auto_refused','auto-refuse at H does not forfeit a present guest');
  ok(D(pa,{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'auto',at:iso(now+40*60e3)}}).requests[0].depositStatus==='returned','present imprévu guest: returned at H+30/clôture');
  const pr=D(p,{type:'RESPOND_IMPREVU',payload:{imprevuId:'i1',decision:'refused',respondedAt:iso(now),respondedByUserId:'h1',forfeitReporterDeposit:true}});
  ok(pr.requests[0].depositStatus==='held','manual refuse does not forfeit a present guest');
  ok(auto(base(10*60e3)).requests[0].depositStatus==='forfeited','auto-refuse still forfeits a non-present guest');
  // départ avant H+30 sans motif après imprévu + présence → perdue
  const pl={...pa,outings:[{...pa.outings[0],startsAt:iso(now-5*60e3)}]};
  ok(D(pl,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reportId:'z'}}).requests[0].depositStatus==='forfeited','present imprévu guest leaving <H+30 no reason forfeited');
  // no-show refusé pour présent / parti
  const ns=(s0:any)=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(now)}});
  const pres=S({outings:[o({startsAt:iso(now-5*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held',attendance:'present'})]});
  ok(ns(pres).requests[0].attendance==='present'&&ns(pres).requests[0].depositStatus==='held','no-show refused for present guest');
  const left=D(S({outings:[o({startsAt:iso(now-40*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})]}),{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reportId:'z'}});
  const nl=ns(left); ok(nl.requests[0].attendance===undefined&&nl.requests[0].depositStatus==='returned'&&!(nl.guestNoShowStrikes.u1),'no-show refused (reducer) for guest who left');
  // clôture (COMPLETE_OUTING) avant H+30 : présent → rendue, départ ensuite refusé
  const early={...D({...D(S({outings:[o({startsAt:iso(now-10*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})]}),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now)}}),currentUser:host},{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'host',at:iso(now)}}),currentUser:me};
  ok(early.requests[0].depositStatus==='returned'&&D(early,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reportId:'z'}}).requests[0].leftTableAt===undefined,'clôture before H+30: present returned, leave refused');
}

// caution déjà rendue (joker, imprévu accepté…) au départ : ni part hôte ni ligne Moment
{
  const LT=require('../src/utils/leaveTable');
  const st=S({outings:[o({startsAt:iso(now-5*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'returned'})]});
  const L=(reason?:any)=>D(st,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason,reportId:'lv'}});
  const a=L(), b=L('discomfort');
  const hostSees=(s:any)=>JSON.stringify({req:LT.projectRequestForHost(s.requests[0]),view:LT.hostLeaveView(s.requests[0]),outing:s.outings[0]});
  ok(a.requests[0].hostLeaveShareEuros===undefined&&b.requests[0].hostLeaveShareEuros===undefined,'returned deposit: no host share (both)');
  ok(LT.hostLeaveView(a.requests[0]).earningsEuros===0&&LT.hostLeaveView(a.requests[0]).earningsLabel==='','returned deposit: host sees no 13,10 €');
  ok(a.momentPaidHostLines.length===0&&b.momentPaidHostLines.length===0,'returned deposit: no Moment-paid line (both)');
  ok(hostSees(a)===hostSees(b)&&a.requests[0].depositStatus==='returned','returned deposit: host view identical, stays returned');
  ok(!b.confidentialLeaveReports[0].guestDepositRefundedEuros,'returned deposit: no double refund');
}

// clôture (17/10) : seul l’hôte, à partir de H ; auto à H+30 intacte
{
  const start=now+60*60e3;
  const base=(user:any)=>S({currentUser:user,outings:[o({startsAt:iso(start),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})]});
  const C=(s0:any,at:number,by?:any)=>D(s0,{type:'COMPLETE_OUTING',payload:{outingId:'o1',at:iso(at),by}});
  ok(C(base(me),start+60*60e3).outings[0].status==='closed','non-host cannot complete (even after H)');
  ok(C(base(me),start,'host').outings[0].status==='closed','non-host by:host refused');
  ok(C(base(host),start-1).outings[0].status==='closed','host refused at H−1 ms');
  ok(C(base(host),start).outings[0].status==='completed','host accepted exactly at H');
  ok(D(base(host),{type:'COMPLETE_OUTING',payload:{outingId:'o1'}}).outings[0].status==='closed','host refused before H (default now)');
  // auto H+30 : marche pour tout utilisateur courant, refusée avant
  ok(C(base(me),start+30*60e3,'auto').outings[0].status==='completed','auto completion at H+30 (guest device)');
  ok(C(base(null),start+31*60e3,'auto').outings[0].status==='completed','auto completion after H+30 (no user)');
  ok(C(base(me),start+30*60e3-1,'auto').outings[0].status==='closed','auto refused before H+30');
  const auto=C(base(me),start+30*60e3,'auto');
  ok(auto.requests[0].depositStatus==='held','auto: unmarked confirmed keeps held (silence rule unchanged)');
  {
    const p=D(base(me),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(start)}});
    ok(C(p,start+30*60e3,'auto').requests[0].depositStatus==='returned','auto H+30: present guest returned');
  }
  // invité : peut encore partir entre H et la clôture, plus après
  const L=(s0:any,at:number,reason?:any)=>D(s0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(at),reason,reportId:'c'}});
  ok(!!L(base(me),start+10*60e3).requests[0].leftTableAt&&L(base(me),start+10*60e3).requests[0].depositStatus==='forfeited','guest can leave between H and closure');
  ok(L(base(me),start+10*60e3,'discomfort').confidentialLeaveReports.length===1,'guest can leave with discomfort between H and closure');
  const closed={...C(base(host),start+10*60e3),currentUser:me};
  ok(closed.outings[0].status==='completed'&&L(closed,start+15*60e3).requests[0].leftTableAt===undefined,'no leave after host closure');
}

// statut interne malaise 'returned_discomfort_leave' (17/10)
{
  const LT=require('../src/utils/leaveTable');
  const JE=require('../src/utils/jokerExemption');
  const st=(off:number,x:any={})=>S({outings:[o({startsAt:iso(now+off),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held',...x})]});
  const L=(s0:any,at:number,reason?:any,id='lv')=>D(s0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(at),reason,reportId:id}});
  const b=L(st(-5*60e3),now,'discomfort'), a=L(st(-5*60e3),now);
  ok(b.requests[0].depositStatus==='returned_discomfort_leave','discomfort <H+30: new internal status');
  ok(b.requests[0].depositStatus!=='forfeited'&&a.requests[0].depositStatus==='forfeited','discomfort no longer forfeited; no-motive still forfeited');
  const b2=L(st(-40*60e3),now,'discomfort'), a2=L(st(-40*60e3),now);
  ok(b2.requests[0].depositStatus==='returned_discomfort_leave'&&LT.hostDepositStatus(b2.requests[0])==='returned'&&LT.hostDepositStatus(a2.requests[0])==='returned','discomfort ≥H+30: internal status, host sees returned like no-motive');
  // vue hôte projetée strictement identique (demande complète)
  ok(JSON.stringify(LT.projectRequestForHost(a.requests[0]))===JSON.stringify(LT.projectRequestForHost(b.requests[0])),'projected host request identical <H+30');
  ok(JSON.stringify(LT.projectRequestForHost(a2.requests[0]))===JSON.stringify(LT.projectRequestForHost(b2.requests[0])),'projected host request identical ≥H+30');
  ok(JSON.stringify(LT.hostLeaveView(a.requests[0]))===JSON.stringify(LT.hostLeaveView(b.requests[0])),'hostLeaveView identical');
  // vue invité : remboursée
  ok(LT.isDepositReturnedForGuest(b.requests[0].depositStatus)&&PR.DEPOSIT_STATUS_LABELS[b.requests[0].depositStatus]==='Caution remboursée'&&PR.describeDepositOutcome('returned_discomfort_leave').includes('remboursée'),'guest sees « Caution remboursée »');
  ok(!LT.isDepositReturnedForGuest(a.requests[0].depositStatus),'no-motive early leave not shown refunded');
  // ligne Moment 13,10 € inchangée, remboursement unique
  ok(b.momentPaidHostLines.length===1&&b.momentPaidHostLines[0].amountEuros===13.1&&b.confidentialLeaveReports[0].guestDepositRefundedEuros===20,'Moment line 13,10 € + 20 € refund unchanged');
  const again=L(b,now+60e3,'discomfort','lv2');
  ok(again.momentPaidHostLines.length===1&&again.confidentialLeaveReports.length===1&&again.requests[0].depositStatus==='returned_discomfort_leave','second leave: no double refund / line');
  // seuil 2 malaises en 3 mois : lit le statut produit par le départ
  const prior={id:'old',outingId:'o0',requestId:'r0',guestId:'u1',hostId:'h2',reason:'discomfort',createdAt:iso(now-30*24*H),guestDepositRefundedEuros:20};
  const t=L({...st(-5*60e3),confidentialLeaveReports:[prior]},now,'discomfort');
  ok(t.requests[0].depositStatus==='returned_discomfort_leave'&&t.currentUser.manualReviewRequired===true&&LT.countRecentDiscomfort(t.confidentialLeaveReports,'u1',now)===2,'threshold: 2nd discomfort → review, still refunded (new status)');
  ok(t.confidentialLeaveReports[0].guestDepositRefundedEuros===20,'2nd discomfort deposit refunded (DECISIONS)');
  // pas de nouvelle perte : annulation, no-show, imprévu refusé, joker, clôture, silence
  ok(D(b,{type:'CANCEL_REQUEST',payload:{requestId:'r1',cancelledAt:iso(now),by:'guest'}}).requests[0].depositStatus==='returned_discomfort_leave','cancel after discomfort leave: no new loss');
  ok(D(a2,{type:'CANCEL_REQUEST',payload:{requestId:'r1',cancelledAt:iso(now),by:'guest'}}).requests[0].depositStatus==='returned','cancel after free leave: refused');
  ok(D(b,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(now)}}).requests[0].depositStatus==='returned_discomfort_leave','no-show after discomfort leave: no loss');
  const bi={...b,imprevuReports:[{id:'i1',outingId:'o1',requestId:'r1',reporterId:'u1',reporterName:'Moi',responderIds:['h1'],motive:'autre',reason:'x',status:'pending',createdAt:iso(now)}]};
  ok(D(bi,{type:'RESPOND_IMPREVU',payload:{imprevuId:'i1',decision:'auto_refused',respondedAt:iso(now),forfeitReporterDeposit:true}}).requests[0].depositStatus==='returned_discomfort_leave','imprévu refusal after discomfort leave: no loss');
  ok(D(b,{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'auto',at:iso(now+30*60e3)}}).requests[0].depositStatus==='returned_discomfort_leave','auto closure keeps status');
  ok(D(b,{type:'RETURN_DEPOSIT_SILENCE',payload:{requestId:'r1'}}).requests[0].depositStatus==='returned_discomfort_leave','silence return: untouched');
  ok(JE.resolveGuestCancelDeposit({by:'guest',freeWindow:false,jokerExempted:false,currentDeposit:'returned_discomfort_leave'})==='returned_discomfort_leave'&&JE.resolveGuestCancelDeposit({by:'host',freeWindow:false,jokerExempted:false,currentDeposit:'returned_discomfort_leave'})==='returned_discomfort_leave','resolveGuestCancelDeposit keeps new status');
  // caution déjà rendue avant départ malaise : pas de nouveau statut, pas de 2e remboursement
  const r0=L(st(-5*60e3,{depositStatus:'returned'}),now,'discomfort');
  ok(r0.requests[0].depositStatus==='returned'&&!r0.confidentialLeaveReports[0].guestDepositRefundedEuros&&r0.momentPaidHostLines.length===0,'already returned: stays returned, no refund, no line');
}

// démo « Simuler sortie terminée » (option A) : clôture auto H+30 forcée
{
  const DC=require('../src/utils/demoComplete');
  const start=now+2*H; // moment futur : la démo doit marcher quand même
  const base=(user:any,rx:any={})=>S({currentUser:user,outings:[o({startsAt:iso(start),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held',...rx})]});
  const act=DC.buildDemoAutoCompleteAction(base(me).outings[0]);
  ok(act&&act.payload.by==='auto'&&act.payload.at===iso(start+30*60e3)&&act.payload.outingId==='o1','demo action: auto, at = startsAt + H+30');
  ok(DC.buildDemoAutoCompleteAction(o({status:'completed'}))===null&&DC.buildDemoAutoCompleteAction(o({status:'cancelled'}))===null&&DC.buildDemoAutoCompleteAction(undefined)===null&&DC.buildDemoAutoCompleteAction(o({startsAt:'x'}))===null,'demo action: null when completed/cancelled/missing/invalid');
  for (const [who,user] of [['guest',me],['host',host],['no user',null]] as any) {
    const c1=D(base(user),act);
    ok(c1.outings[0].status==='completed','demo closure works for '+who);
    // présences démo marquées après la clôture (markedAt = startsAt) → caution rendue, état cohérent
    const p1=D(c1,{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(start)}});
    ok(p1.requests[0].attendance==='present'&&p1.requests[0].depositStatus==='returned','demo presence after closure: returned ('+who+')');
  }
  // présent avant la clôture démo → rendu par la clôture
  const pre=D(base(me),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(start)}});
  ok(pre.requests[0].depositStatus==='held'&&D(pre,act).requests[0].depositStatus==='returned','demo closure returns deposit of present guest');
  // règle réelle inchangée : sans by auto, l’invité ne peut pas clôturer
  ok(D(base(me),{type:'COMPLETE_OUTING',payload:{outingId:'o1',at:iso(start+30*60e3)}}).outings[0].status==='closed','real rule unchanged: guest by host refused');
  ok(D(D(base(me),act),act).outings[0].status==='completed','demo closure idempotent');
}

// fil d’annonces : un moment complet sort du fil (17/10)
{
  ok(!OA.isVisibleOnAnnoncesFeed(o({status:'full',spotsLeft:0})),'full outing hidden');
  ok(!OA.isVisibleOnAnnoncesFeed(o({status:'open',spotsLeft:0})),'spotsLeft 0 hidden even if status open');
  ok(!OA.isVisibleOnAnnoncesFeed(o({status:'full',spotsLeft:0,urgentOnSite:true,startsAt:iso(now-5*60e3)})),'urgent full hidden');
  ok(!OA.isVisibleOnAnnoncesFeed(o({status:'open',spotsLeft:0,urgentOnSite:true,startsAt:iso(now-5*60e3)})),'urgent spotsLeft 0 hidden');
  ok(OA.isVisibleOnAnnoncesFeed(o({status:'open',spotsLeft:1,urgentOnSite:true,startsAt:iso(now-5*60e3)})),'urgent with a seat still visible');
  // 2 places, 1 accepté → reste dans le fil ; 2e accepté → complet, hors du fil
  let f=S({requests:[rq(),rq({id:'r2',userId:'u2',userName:'B'})]});
  f=D(f,{type:'ACCEPT_REQUEST',payload:{requestId:'r1',acceptedAt:iso(now),confirmDeadlineAt:iso(now+600e3)}});
  ok(f.outings[0].spotsLeft===1&&OA.isVisibleOnAnnoncesFeed(f.outings[0]),'one seat left + one accepted: in feed');
  f=D(f,{type:'ACCEPT_REQUEST',payload:{requestId:'r2',acceptedAt:iso(now),confirmDeadlineAt:iso(now+600e3)}});
  ok(f.outings[0].spotsLeft===0&&!OA.isVisibleOnAnnoncesFeed(f.outings[0]),'all seats taken: out of feed');
  // place libérée par expiration (confirm hors délai) → revient
  const ex=D(f,{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now+11*60e3)}});
  ok(ex.requests[0].status==='expired'&&ex.outings[0].spotsLeft===1&&OA.isVisibleOnAnnoncesFeed(ex.outings[0]),'seat freed by expiry: back in feed');
  // place libérée par annulation d’un confirmé → revient
  let cf=D(f,{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now+60e3)}});
  ok(!OA.isVisibleOnAnnoncesFeed(cf.outings[0]),'full after confirm: out of feed');
  cf=D(cf,{type:'CANCEL_REQUEST',payload:{requestId:'r1',cancelledAt:iso(now+2*60e3),by:'guest'}});
  ok(cf.outings[0].spotsLeft===1&&OA.isVisibleOnAnnoncesFeed(cf.outings[0]),'seat freed by cancel: back in feed');
  // règles existantes inchangées : passé (non urgent) hors du fil, urgent H+31 hors du fil
  ok(!OA.isVisibleOnAnnoncesFeed(o({startsAt:iso(now-60e3),spotsLeft:1}))&&!OA.isVisibleOnAnnoncesFeed(o({urgentOnSite:true,startsAt:iso(now-31*60e3),spotsLeft:1})),'existing time rules unchanged');
}

// urgent 1 place (QA 17/10) : acceptée → hors du fil ; confirmation expirée avant H+30 → revient
{
  const uo=o({urgentOnSite:true,startsAt:iso(now),capacity:1,spotsLeft:1,status:'open'});
  let u1=S({outings:[uo],requests:[rq()]});
  ok(OA.isVisibleOnAnnoncesFeed(u1.outings[0],now),'urgent 1 seat: in feed before accept');
  u1=D(u1,{type:'ACCEPT_REQUEST',payload:{requestId:'r1',acceptedAt:iso(now),confirmDeadlineAt:iso(now+10*60e3)}});
  ok(u1.requests[0].status==='accepted'&&u1.outings[0].spotsLeft===0&&!OA.isVisibleOnAnnoncesFeed(u1.outings[0],now+60e3),'urgent 1 seat accepted: out of feed');
  const ue=D(u1,{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now+11*60e3)}});
  ok(ue.requests[0].status==='expired'&&ue.outings[0].spotsLeft===1&&OA.isVisibleOnAnnoncesFeed(ue.outings[0],now+11*60e3),'urgent 1 seat: late confirm expired before H+30 → back in feed');
  const ut=D(u1,{type:'EXPIRE_REQUEST',payload:{requestId:'r1'}});
  ok(ut.requests[0].status==='expired'&&ut.outings[0].spotsLeft===1&&OA.isVisibleOnAnnoncesFeed(ut.outings[0],now+10*60e3+1),'urgent 1 seat: timer expiry (EXPIRE_REQUEST) → back in feed');
  ok(!OA.isVisibleOnAnnoncesFeed(ue.outings[0],now+31*60e3),'urgent: still leaves feed after H+30');
}
// garde démo (__DEV__) — menu et fonctions démo inertes en production
{
  const DC=require('../src/utils/demoComplete');
  const DM=require('../src/utils/devMode');
  const outing=o({startsAt:iso(now+H),status:'closed'});
  const st=S({currentUser:me,outings:[outing],requests:[rq({status:'confirmed',depositStatus:'held'})]});
  ok(DM.isDemoEnabled()===true&&DC.buildDemoAutoCompleteAction(outing)!==null,'dev: demo enabled, demo closure built');
  ok(D(S({currentUser:{...me}}),{type:'DEMO_BECOME_PARTNER',payload:{kind:'bar'}}).currentUser.partnerStatus!==undefined,'dev: DEMO_BECOME_PARTNER applies');
  (globalThis as any).__DEV__=false;
  try {
    ok(DM.isDemoEnabled()===false,'prod: demo disabled');
    ok(DC.buildDemoAutoCompleteAction(outing)===null,'prod: no forced demo closure');
    const before=JSON.stringify(st);
    for (const a of [{type:'RESET_DEMO'},{type:'SIMULATE_TRIAL_END'},{type:'DEMO_BECOME_PARTNER',payload:{kind:'bar'}},{type:'DEMO_LEAVE_PARTNER'},{type:'SET_PARTNER_PINNED',payload:{pinned:true}}] as any[]) {
      ok(JSON.stringify(D(st,a))===before,'prod: '+a.type+' is a no-op');
    }
    // règles réelles intactes en production : clôture hôte à H, auto H+30
    ok(D({...st,currentUser:host},{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'host',at:iso(now+H)}}).outings[0].status==='completed','prod: real host closure unchanged');
    ok(D(st,{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'auto',at:iso(now+H+30*60e3)}}).outings[0].status==='completed','prod: real auto H+30 unchanged');
  } finally {
    (globalThis as any).__DEV__=true;
  }
  (globalThis as any).__DEV__=undefined;
  ok(DM.isDemoEnabled()===false,'__DEV__ undefined → disabled');
  (globalThis as any).__DEV__=true;
}

// garde démo (QA v2) : contrôle statique — chaque fonction démo du contexte est gardée,
// et tout appel hors du menu démo est derrière isDemoEnabled()
{
  const fs=require('node:fs'), path=require('node:path');
  const src=(f:string)=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8');
  const ctx=src('data/ChanceContext.tsx');
  const re=/const (simulate\w+|demo\w+|seed\w+|resetDemo) = useCallback\(/g; let m:any; const names:string[]=[]; const unguarded:string[]=[];
  while((m=re.exec(ctx))){ names.push(m[1]); const body=ctx.slice(m.index,m.index+400); if(!body.includes('if (!isDemoEnabled())')) unguarded.push(m[1]); }
  ok(names.length===19&&names.includes('simulateOtherHideConsent'),'static: demo callbacks found ('+names.length+')');
  for(const n of ['reviewPartnerApplication','setPartnerPinned']){ const i=ctx.indexOf('const '+n+' = useCallback('); ok(i>0&&ctx.slice(i,i+400).includes('if (!isDemoEnabled())'),'static: menu-only '+n+' guarded'); }
  ok(unguarded.length===0,'static: every demo callback guarded'+(unguarded.length?' — missing: '+unguarded.join(','):''));
  // appels hors menu démo
  const walk=(d:string):string[]=>fs.readdirSync(d,{withFileTypes:true}).flatMap((e:any)=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
  const outside:string[]=[];
  for(const f of walk(path.join(__dirname,'..','src'))){
    if(!/\.tsx?$/.test(f)||/ChanceContext\.tsx$|DemoMenuModal\.tsx$|demoTools\.ts$/.test(f)) continue;
    const t=fs.readFileSync(f,'utf8');
    for(const n of names){ if(new RegExp('\\b'+n+'\\b').test(t)) outside.push(path.basename(f)+':'+n); }
  }
  ok(JSON.stringify(outside.sort())===JSON.stringify(['ReviewsScreen.tsx:simulateOtherHideConsent']),'static: demo calls outside menu = '+outside.join(','));
  const rv=src('screens/ReviewsScreen.tsx'), pf=src('screens/ProfileScreen.tsx');
  ok(/isDemoEnabled\(\) \? \(\s*<Pressable[\s\S]{0,200}simulateOtherHideConsent/.test(rv),'static: ReviewsScreen demo entry behind isDemoEnabled()');
  ok(/const missingPresent = getCompletedOutingsMissingPresent\(\)\.filter\(\s*\(item\) => item\.outing\.hostId === state\.currentUser\?\.id,?\s*\);/.test(pf)&&!/isDemoEnabled\(\)\s*\?\s*getCompletedOutingsMissingPresent/.test(pf)&&!/demoMarkConfirmedPresent/.test(pf)&&/markGuestsPresentAndRate\(\s*item\.outing\.id,\s*presenceChecked,?\s*\)/.test(pf),'static: ProfileScreen « Marquer présent et noter » hôte seulement, visible hors dev, cochés seulement');
  ok(/setPresenceChecked\(\[\]\); \/\/ rien de pré-coché/.test(pf),'static: nothing pre-checked');
  ok(/if \(!marked\.ok\) \{\s*Alert\.alert\([\s\S]{0,240}markPresentReasonLabel\(marked\.reason\)[\s\S]{0,120}return;/.test(pf),'static: ProfileScreen — alerte avec motif, pas d’avis si présence refusée');
  ok(/isDemoEnabled\(\) \? ' Outils QA : 5 taps sur le logo Moment\.' : ''/.test(pf)&&!/Outils QA :\s*\n\s*5 taps/.test(pf),'static: QA note hidden outside dev');
}

// « Marquer présent et noter » (Profil) — hôte, invité par invité, atomique, aussi hors dev (17/10)
{
  (globalThis as any).__DEV__=false;
  const MK=require('../src/utils/markPresent');
  const RE=require('../src/utils/reviewEligibility');
  const DM=require('../src/utils/devMode');
  ok(DM.isDemoEnabled()===false,'present button: tests run with __DEV__ false');
  const hostU:any={id:'h1',firstName:'Hôte'};
  const end=now-2*H; // moment terminé
  const out=(x:any={})=>o({startsAt:iso(end),status:'completed',...x});
  const g=(x:any={})=>rq({status:'confirmed',depositStatus:'held',...x});
  const g2=(x:any={})=>g({id:'r2',userId:'u2',userName:'Bea',...x});
  const MG=(st:any,ids:string[],at=now)=>D(st,{type:'MARK_GUESTS_PRESENT',payload:{outingId:'o1',requestIds:ids,markedAt:iso(at)}});
  // liste : confirmés non partis, annulés / partis / absents exclus, rien de pré-coché (API sans état coché)
  const cl=MK.presenceChecklist({userId:'h1',outing:out(),requests:[g(),g2(),g({id:'r3',userId:'u3',status:'cancelled'}),g({id:'r4',userId:'u4',leftTableAt:iso(end+10*60e3)}),g({id:'r5',userId:'u5',attendance:'absent',depositStatus:'forfeited'})]});
  ok(cl.ok&&JSON.stringify(cl.candidates.map((c:any)=>c.requestId))==='["r1","r2"]'&&cl.alreadyPresent.length===0&&cl.windowOpen,'checklist: confirmed not left, cancelled/left/absent excluded');
  // seul le coché est marqué ; l’autre reste sans présence, caution non rendue, « Pas venu » toujours possible
  let st=S({currentUser:hostU,outings:[out()],requests:[g(),g2()]});
  let m1=MG(st,['r2']);
  ok(m1.requests[1].attendance==='present'&&m1.requests[1].depositStatus==='returned','checked guest: present, caution per existing rule (completed → returned)');
  ok(m1.requests[0].attendance===undefined&&m1.requests[0].depositStatus==='held','unchecked guest: no presence, caution not returned by this button');
  const ns=D(m1,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,banned:false,reportedAt:iso(now)}});
  ok(ns.requests[0].attendance==='absent'&&ns.requests[0].depositStatus==='forfeited','unchecked guest: still reportable « Pas venu »');
  // la clôture ne rend pas présents les non cochés
  let st2=S({currentUser:hostU,outings:[o({startsAt:iso(now-10*60e3),status:'closed'})],requests:[g(),g2()]});
  let m2=MG(st2,['r1']);
  ok(m2.requests[0].attendance==='present'&&m2.requests[0].depositStatus==='held','before H+30: checked present, caution held (unchanged rule)');
  let c2=D(m2,{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'auto',at:iso(now+30*60e3)}});
  ok(c2.requests[1].attendance===undefined&&c2.requests[1].depositStatus!=='returned','closure does not make unchecked guest present / return caution');
  ok(D(c2,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r2',guestId:'u2',strike:1,lowerPriority:false,banned:false,reportedAt:iso(now+31*60e3)}}).requests[1].attendance==='absent','unchecked guest still « Pas venu » after closure');
  // atomicité : une sélection invalide → rien n’est marqué (pas de résultat partiel)
  const stA=S({currentUser:hostU,outings:[out()],requests:[g(),g2({attendance:'absent',depositStatus:'forfeited'})]});
  const mA=MG(stA,['r1','r2']);
  ok(mA.requests[0].attendance===undefined&&mA.requests[0].depositStatus==='held'&&mA.requests[1].attendance==='absent','atomic: one invalid id (absent) → nobody marked');
  ok(MG(st,['r1','zz']).requests.every((r:any)=>r.attendance===undefined),'atomic: unknown id → nobody marked');
  ok(MG(st,['r1','r2']).requests.every((r:any)=>r.attendance==='present'),'all checked → all present in one action');
  ok(MG(st,[])===st||JSON.stringify(MG(st,[]))===JSON.stringify(st),'empty selection: no-op');
  // contrôles existants : hôte, H−15
  ok(MG({...st,currentUser:me},['r1']).requests[0].attendance===undefined,'reducer: non-host cannot mark');
  const early=S({currentUser:hostU,outings:[o({startsAt:iso(now+20*60e3)})],requests:[g()]});
  ok(MG(early,['r1']).requests[0].attendance===undefined&&MK.validatePresenceSelection({userId:'h1',outing:early.outings[0],requests:early.requests,requestIds:['r1'],nowMs:now}).reason==='too_early','before H−15 refused');
  const ok15=S({currentUser:hostU,outings:[o({startsAt:iso(now+14*60e3)})],requests:[g()]});
  ok(MG(ok15,['r1']).requests[0].attendance==='present','from H−15 ok');
  // validation de la sélection (pour l’avis)
  const V=(ids:string[],reqs:any[],userId='h1',outing=out())=>MK.validatePresenceSelection({userId,outing,requests:reqs,requestIds:ids,nowMs:now});
  ok(V([],[g(),g2()]).reason==='none_selected'&&/Coche/.test(MK.markPresentReasonLabel('none_selected')),'nothing checked → no review, reason');
  const vp=V([],[g({attendance:'present',depositStatus:'returned'})]); ok(vp.ok&&vp.requestIds.length===0&&vp.rateTarget.toUserId==='u1','already present → review can open');
  const v2=V(['r2'],[g(),g2()]); ok(v2.ok&&v2.rateTarget.toUserId==='u2','review target = first checked');
  ok(V(['r1'],[g()],'u1').reason==='not_host'&&V(['r1'],[g({attendance:'absent'})]).reason==='already_absent'&&V(['r1'],[g()],'h1',out({status:'cancelled'})).reason==='outing_cancelled'&&V(['r1'],[]).reason==='no_guest','refusals: not host / after « Pas venu » / cancelled / no guest');
  // avis invité : seulement si présence établie
  const rv=(from:string,to:string,reqs:any[],outing=out())=>RE.reviewEligibility({fromUserId:from,toUserId:to,outing,requests:reqs,reviews:[]});
  ok(rv('u1','h1',[g()]).reason==='not_participant','guest review: confirmed but not present → refused');
  ok(rv('u1','h1',[g({attendance:'present'})]).ok===true,'guest review: present → ok');
  ok(rv('u1','h1',[g({attendance:'present'})],out({status:'closed'})).reason==='not_completed','guest review: only after the moment');
  ok(rv('h1','u1',[g()]).reason==='target_not_participant'&&rv('h1','u1',[g({attendance:'present'})]).ok,'host review: only present guests');
  const review=(from:string,to:string)=>({id:'rvx',outingId:'o1',fromUserId:from,toUserId:to,rating:4,venueRating:4,venueKey:'k',createdAt:iso(now)});
  ok(!D(S({currentUser:me,outings:[out()],requests:[g()]}),{type:'ADD_REVIEW',payload:review('u1','h1')}).reviews.some((x:any)=>x.id==='rvx'),'reducer ADD_REVIEW: guest not present refused');
  ok(D(S({currentUser:me,outings:[out()],requests:[g({attendance:'present'})]}),{type:'ADD_REVIEW',payload:review('u1','h1')}).reviews.some((x:any)=>x.id==='rvx'),'reducer ADD_REVIEW: guest present ok');
  (globalThis as any).__DEV__=true;
}
console.log({pass,fail});
if(fail) process.exitCode=1;
