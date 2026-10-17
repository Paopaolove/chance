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
  ok(names.length===20&&names.includes('simulateOtherHideConsent')&&names.includes('demoSimulateDepositH6'),'static: demo callbacks found ('+names.length+')');
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

// Signalement et revue + compteur hôte (17/10)
{
  const TR=require('../src/utils/tableReports');
  const LT=require('../src/utils/leaveTable');
  const start=now-10*60e3;
  const g2:any={id:'u2',firstName:'Bea'};
  const base=(user:any,x:any={})=>S({currentUser:user,outings:[o({startsAt:iso(start),status:'closed',...x})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'}),rq({id:'r3',userId:'u3',userName:'Cle',status:'pending'})]});
  const SUB=(s0:any,target:string,at=now,id='t1',note?:string,category:any='other')=>D(s0,{type:'SUBMIT_TABLE_REPORT',payload:{id,outingId:'o1',targetUserId:target,category,note,createdAt:iso(at)}});
  // catégorie obligatoire (une parmi 8)
  ok(D(base(me),{type:'SUBMIT_TABLE_REPORT',payload:{id:'t0',outingId:'o1',targetUserId:'h1',createdAt:iso(now)}}).tableReports.length===0&&SUB(base(me),'h1',now,'t1',undefined,null).tableReports.length===0,'category required');
  ok(SUB(base(me),'h1',now,'t1',undefined,'rien_dans_le_chat').tableReports.length===0&&SUB(base(me),'h1',now,'t1',undefined,'discomfort').tableReports.length===0,'unknown category refused (malaise is not a category)');
  ok(JSON.stringify(Object.values(TR.TABLE_REPORT_CATEGORY_LABELS))===JSON.stringify(['Proposition ou geste déplacé','Racisme','Sexisme','Insultes ou agressivité','Menaces','Ce n’était pas la personne','Démarchage','Autre'])&&TR.TABLE_REPORT_CATEGORIES.length===8,'8 categories, exact labels');
  for(const c of TR.TABLE_REPORT_CATEGORIES){ const x=SUB(base(me),'h1',now,'t-'+c,undefined,c); ok(x.tableReports.length===1&&x.tableReports[0].category===c,'category accepted: '+c); }
  {
    // le départ malaise reste séparé : aucun signalement créé, circuit confidentiel inchangé
    const st0={...base(me),outings:[o({startsAt:iso(now-5*60e3),status:'closed'})]};
    const lvD=D(st0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason:'discomfort',reportId:'lvd'}});
    ok(lvD.tableReports.length===0&&lvD.confidentialLeaveReports.length===1&&lvD.confidentialLeaveReports[0].reason==='discomfort','discomfort leave: separate confidential report, no table report / category');
  }
  // droit de signaler
  ok(SUB(base(me),'h1').tableReports.length===1,'guest member can report host');
  ok(SUB(base(host),'u1').tableReports.length===1,'host can report guest');
  ok(SUB(base(me),'u2').tableReports.length===1,'guest can report other guest');
  ok(SUB(base({...me,id:'u3'}),'h1').tableReports.length===0,'pending (non-member) cannot report');
  ok(SUB(base({...me,id:'zz'}),'h1').tableReports.length===0,'outsider cannot report');
  ok(SUB(base(me),'u3').tableReports.length===0&&SUB(base(me),'zz').tableReports.length===0,'target must be a table member');
  ok(SUB(base(me),'u1').tableReports.length===0,'cannot report oneself');
  // ouverture = chat de la table (même règle) ; refusé avant la confirmation
  {
    const fut=(user:any,reqs:any[],x:any={})=>S({currentUser:user,outings:[o({startsAt:iso(now+5*H),status:'open',...x})],requests:reqs});
    const acc=rq({status:'accepted',acceptedAt:iso(now),confirmDeadlineAt:iso(now+10*60e3)});
    ok(SUB(fut(me,[acc]),'h1').tableReports.length===0,'before confirmation (accepted) refused');
    ok(SUB(fut(me,[rq()]),'h1').tableReports.length===0,'pending refused');
    ok(SUB(fut(host,[acc]),'u1').tableReports.length===0&&!TR.canOpenTableReport(fut(host,[acc]).outings[0],[acc],'h1'),'host: no confirmed guest yet → refused');
    const conf=D(fut(me,[acc]),{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now+60e3)}});
    // table normale : confirmé mais chat fermé (avant H−1) → refusé ; à H−1 → accepté
    const h1=now+4*H; // H−1 (start = now+5H)
    ok(conf.requests[0].status==='confirmed'&&SUB(conf,'h1',now+2*60e3).tableReports.length===0&&!TR.canOpenTableReport(conf.outings[0],conf.requests,'u1',now+2*60e3),'normal table: confirmed but chat closed → refused');
    ok(SUB(conf,'h1',h1-1).tableReports.length===0&&!C.isChatUnlocked(conf.outings[0].startsAt,h1-1),'normal table: 1 ms before H−1 refused (chat closed)');
    ok(C.isChatUnlocked(conf.outings[0].startsAt,h1)&&SUB(conf,'h1',h1).tableReports.length===1,'normal table: accepted when chat opens (H−1)');
    ok(SUB({...conf,currentUser:host},'u1',h1).tableReports.length===1&&TR.canOpenTableReport(conf.outings[0],conf.requests,'h1',h1),'host can report from chat opening');
    ok(TR.canOpenTableReport(conf.outings[0],conf.requests,'u1',h1)&&!TR.canOpenTableReport(conf.outings[0],conf.requests,'zz',h1),'link « Signaler un souci » visible for members from chat opening');
    for(const k of [{urgentOnSite:true},{isPartnerListing:true}]){
      const cf=D(fut(me,[acc],k),{type:'CONFIRM_SLOT',payload:{requestId:'r1',confirmedAt:iso(now+60e3)}});
      ok(cf.requests[0].status==='confirmed'&&C.isOutingChatOpen(cf.outings[0],now+2*60e3)&&SUB(cf,'h1',now+2*60e3).tableReports.length===1,'chat opens at confirmation ('+Object.keys(k)[0]+') → report ok');
      ok(SUB(fut(me,[acc],k),'h1',now+2*60e3).tableReports.length===0,'chat-at-confirmation case still refused before confirmation ('+Object.keys(k)[0]+')');
    }
    ok(TR.canOpenTableReport(conf.outings[0],conf.requests,'u1',h1)===C.isChatUnlocked(conf.outings[0].startsAt,h1,C.chatUnlockOptsFor(conf.outings[0]))&&TR.canOpenTableReport(conf.outings[0],conf.requests,'u1',now)===C.isChatUnlocked(conf.outings[0].startsAt,now,C.chatUnlockOptsFor(conf.outings[0])),'report gate = chat rule (same function)');
    // annulé exclu (signaleur et cible) ; parti compris
    const can=D(conf,{type:'CANCEL_REQUEST',payload:{requestId:'r1',cancelledAt:iso(now+2*60e3),by:'guest'}});
    ok(can.requests[0].status==='cancelled'&&SUB(can,'h1',h1).tableReports.length===0&&!TR.tableMemberIds(can.outings[0],can.requests).includes('u1'),'cancelled guest: not a member, cannot report');
    const two=fut(host,[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'cancelled'})]);
    ok(SUB(two,'u2',h1).tableReports.length===0&&SUB(two,'u1',h1).tableReports.length===1,'cancelled guest cannot be reported (not a member)');
    ok(JSON.stringify(TR.tableMemberIds(two.outings[0],two.requests))==='["h1","u1"]','members = host + confirmed (cancelled excluded)');
  }
  ok(SUB(base(me,{status:'completed'}),'h1',now+5*H).tableReports.length===1,'after the moment ok');
  ok(SUB(base(me,{status:'cancelled'}),'h1').tableReports.length===0,'cancelled moment refused');
  ok(SUB(base(null),'h1').tableReports.length===0,'no user refused');
  const left=D(base(me),{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reportId:'lv'}});
  ok(left.requests[0].leftTableAt&&left.requests[0].status==='confirmed'&&SUB(left,'h1').tableReports.length===1,'guest who left can still report (still a member)');
  ok(SUB({...left,currentUser:host},'u1').tableReports.length===1,'guest who left can be reported');
  let r=SUB(base(me),'h1',now,'t1','  il a été lourd  ');
  ok(r.tableReports[0].status==='open'&&r.tableReports[0].note==='il a été lourd'&&r.tableReports[0].reporterId==='u1'&&r.tableReports[0].messages.length===0,'report open, note trimmed');
  ok(SUB(base(me),'h1',now,'t1','   ').tableReports[0].note===undefined,'empty note → undefined');
  ok(SUB(r,'h1',now,'t1').tableReports.length===1,'same id idempotent');
  // transitions
  const A=(s0:any,to:string,outcome?:string,abusiveReason?:string,id='t1')=>D(s0,{type:'ADVANCE_TABLE_REPORT',payload:{reportId:id,to,at:iso(now),outcome,abusiveReason}});
  ok(A(r,'contact_target').tableReports[0].status==='open'&&A(r,'closed','sans_suite').tableReports[0].status==='open','no skip from open');
  ok(A(r,'contact_reporter','warning').tableReports[0].status==='open','outcome only at closure');
  let r1=A(r,'contact_reporter'); ok(r1.tableReports[0].status==='contact_reporter'&&r1.tableReports[0].messages[0].to==='reporter'&&r1.tableReports[0].messages[0].userId==='u1','open → contact reporter');
  ok(A(r1,'open').tableReports[0].status==='contact_reporter'&&A(r1,'closed','sans_suite').tableReports[0].status==='contact_reporter','no back / no skip');
  let r2=A(r1,'contact_target'); const tm=r2.tableReports[0].messages[1];
  ok(r2.tableReports[0].status==='contact_target'&&tm.to==='target'&&tm.userId==='h1','contact reporter → contact target');
  // message neutre
  ok(tm.body==='Est-ce que tout s’est bien passé ?'&&tm.body===TR.REPORT_TARGET_MESSAGE,'target message fixed & neutral');
  ok(!/Moi|u1|r1|lourd/.test(JSON.stringify(TR.tableReportMessagesFor(r2.tableReports,'h1'))),'target messages never reveal reporter / note');
  ok(A(r2,'closed').tableReports[0].status==='contact_target','closure needs an outcome');
  // issues
  const nothing=A(r2,'closed','sans_suite'); ok(nothing.tableReports[0].status==='closed'&&nothing.tableReports[0].outcome==='sans_suite'&&JSON.stringify(nothing.memberModeration)==='{}','sans suite: closed, no trace');
  ok(TR.TABLE_REPORT_OUTCOME_LABELS.sans_suite==='Sans suite'&&TR.TABLE_REPORT_OUTCOME_LABELS.abusive==='Signalement abusif'&&TR.TABLE_REPORT_STATUS_LABELS.closed==='Clos','labels: « Sans suite » (registre), file « Clos » kept');
  const warn=A(r2,'closed','warning'); ok(warn.memberModeration.h1.warnings===1&&!warn.memberModeration.u1,'warning: target counter +1');
  ok(A({...warn,tableReports:[{...r2.tableReports[0]}]},'closed','warning').memberModeration.h1.warnings===2,'warnings accumulate');
  const susp=A(r2,'closed','suspension'); ok(susp.memberModeration.h1.suspended===true&&!susp.memberModeration.h1.warnings,'suspension: target flagged');
  // abusif : motif établi exigé (décision Paolo 17/10)
  ok(JSON.stringify(TR.ABUSIVE_REASONS)==='["reporter_absent","reporter_admitted_false","repeated_unconfirmed"]'&&!/chat/i.test(JSON.stringify(TR.ABUSIVE_REASONS)+JSON.stringify(TR.ABUSIVE_REASON_LABELS)),'abusive reasons: exactly 3, no « rien dans le chat »');
  ok(A(r2,'closed','abusive').tableReports[0].status==='contact_target','abusive without reason refused (doubt → sans suite)');
  ok(A(r2,'closed','abusive','nothing_in_chat').tableReports[0].status==='contact_target'&&A(r2,'closed','abusive','bogus').tableReports[0].status==='contact_target','abusive with invalid reason refused');
  ok(A(r2,'closed','sans_suite','reporter_absent').tableReports[0].status==='contact_target'&&A(r1,'contact_target',undefined,'reporter_absent').tableReports[0].status==='contact_reporter','reason only with abusive closure');
  ok(A(r2,'closed','sans_suite').tableReports[0].outcome==='sans_suite','doubt → sans suite closes normally');
  const abus=A(r2,'closed','abusive','reporter_absent'); ok(abus.tableReports[0].status==='closed'&&abus.tableReports[0].outcome==='abusive'&&abus.tableReports[0].abusiveReason==='reporter_absent'&&abus.memberModeration.u1.warnings===1&&abus.memberModeration.u1.abusiveReportAt.length===1&&!abus.memberModeration.h1,'abusive (reporter_absent): 1st → warning on reporter, target untouched');
  const abus2=A(r2,'closed','abusive','reporter_admitted_false'); ok(abus2.tableReports[0].abusiveReason==='reporter_admitted_false'&&abus2.memberModeration.u1.warnings===1&&!abus2.memberModeration.u1.suspended&&JSON.stringify(abus2.currentUser)===JSON.stringify(r2.currentUser),'abusive (admitted false): warning only, no suspension, account untouched');
  // repeated_unconfirmed : ≥ 2 autres signalements du même signaleur, clos, aucun avertissement/suspension
  {
    const cl=(id:string,outcome:string,reporterId='u1',status='closed')=>({id,outingId:'o0',reporterId,targetUserId:'h9',createdAt:iso(now-30*24*H),status,messages:[],outcome:status==='closed'?outcome:undefined});
    const withOthers=(others:any[])=>({...r2,tableReports:[...r2.tableReports,...others]});
    ok(A(withOthers([]),'closed','abusive','repeated_unconfirmed').tableReports[0].status==='contact_target','repeated: 0 other → refused');
    ok(A(withOthers([cl('a','sans_suite')]),'closed','abusive','repeated_unconfirmed').tableReports[0].status==='contact_target','repeated: 1 other → refused');
    ok(A(withOthers([cl('a','sans_suite'),cl('b','sans_suite','u1','contact_reporter')]),'closed','abusive','repeated_unconfirmed').tableReports[0].status==='contact_target','repeated: 2nd other still open → refused');
    ok(A(withOthers([cl('a','sans_suite'),cl('b','sans_suite','u2')]),'closed','abusive','repeated_unconfirmed').tableReports[0].status==='contact_target','repeated: other reporter not counted');
    ok(A(withOthers([cl('a','sans_suite'),cl('b','warning')]),'closed','abusive','repeated_unconfirmed').tableReports[0].status==='contact_target','repeated: one confirmed (warning) → refused');
    ok(A(withOthers([cl('a','sans_suite'),cl('b','sans_suite'),cl('c','suspension')]),'closed','abusive','repeated_unconfirmed').tableReports[0].status==='contact_target','repeated: one confirmed (suspension) → refused');
    const rep=A(withOthers([cl('a','sans_suite'),cl('b','abusive')]),'closed','abusive','repeated_unconfirmed');
    ok(rep.tableReports[0].status==='closed'&&rep.tableReports[0].abusiveReason==='repeated_unconfirmed'&&rep.memberModeration.u1.warnings===1,'repeated: 2 others closed, none confirmed → abusive ok (warning)');
  }
  // « Pas venu » ≠ signalement : un invité marqué « Pas venu » ne signale pas ; drapeau = avis négatif seulement
  {
    const absentMe=(st:any)=>({...st,requests:st.requests.map((x:any)=>x.id==='r1'?{...x,attendance:'absent',depositStatus:'forfeited'}:x)});
    const rv=(x:any={})=>({id:'rv1',outingId:'o1',fromUserId:'h1',toUserId:'u1',rating:1,venueKey:'k',createdAt:iso(now),...x});
    // via le vrai flux « Pas venu » (reducer), puis signalement
    const nsSt=D(base(me),{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,banned:false,reportedAt:iso(now)}});
    ok(nsSt.requests[0].attendance==='absent'&&nsSt.requests[0].depositStatus==='forfeited','no-show flow unchanged: absent + caution forfeited');
    ok(SUB(nsSt,'h1').tableReports.length===0&&SUB(nsSt,'u2').tableReports.length===0,'guest marked « Pas venu »: report refused (reducer)');
    ok(!TR.canOpenTableReport(nsSt.outings[0],nsSt.requests,'u1',now)&&TR.isMarkedNoShow(nsSt.outings[0],nsSt.requests,'u1'),'guest marked « Pas venu »: link hidden (canOpenTableReport false)');
    ok(SUB(absentMe(base(me)),'h1').tableReports.length===0,'absent attendance: refused (model)');
    ok(SUB({...nsSt,currentUser:{...me,id:'u2'}},'h1').tableReports.length===1&&TR.canOpenTableReport(nsSt.outings[0],nsSt.requests,'u2',now),'other guest (not marked) still allowed');
    const pres=D({...base(me),currentUser:host},{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now)}});
    ok(pres.requests[0].attendance==='present'&&SUB({...pres,currentUser:me},'h1').tableReports.length===1,'guest marked present still allowed');
    const KEYS='["category","createdAt","id","messages","outingId","reporterId","status","targetUserId"]';
    const keysOf=(x:any)=>JSON.stringify(Object.keys(x).filter((k)=>x[k]!==undefined).sort());
    ok(SUB(base(me),'h1').tableReports.length===1&&keysOf(SUB(base(me),'h1').tableReports[0])===KEYS,'guest not marked: allowed, report = category + phrase only');
    ok(SUB({...nsSt,currentUser:host},'u1').tableReports.length===1&&keysOf(SUB({...nsSt,currentUser:host},'u1').tableReports[0])===KEYS,'host may still report the no-show guest; no « after no-show » flag');
    ok(JSON.stringify(SUB(nsSt,'h1').requests)===JSON.stringify(nsSt.requests),'refused report: no-show / caution untouched');
    // notation et signalement séparés : aucun drapeau ni donnée d’avis, quel que soit l’avis
    for(const rating of [1,2,3]){
      const x=SUB({...base(me),reviews:[rv({rating})]},'h1',now,'t1','  un mot  ');
      ok(keysOf(x.tableReports[0])==='["category","createdAt","id","messages","note","outingId","reporterId","status","targetUserId"]'&&!/rating|review|follows|rv1/i.test(JSON.stringify(x.tableReports)),'review '+rating+'/5: no flag, no review data in report');
    }
    ok(!/follows|rating|review/i.test(JSON.stringify(SUB({...nsSt,currentUser:host,reviews:[rv()]},'u1').tableReports)),'after « Pas venu » + review: no flag, no review data');
    // abus : critères inchangés, jugés sans avis
    const f1=SUB({...base(me),reviews:[rv()]},'h1');
    let fr=A(A(f1,'contact_reporter'),'contact_target');
    ok(A(fr,'closed','abusive').tableReports[0].status==='contact_target'&&A(fr,'closed','sans_suite').tableReports[0].outcome==='sans_suite','negative review does not make abusive possible; sans suite ok');
    ok(!/follows/.test(JSON.stringify(TR.tableReportMessagesFor(fr.tableReports,'h1'))),'nothing about reviews in messages');
    {
      const fs=require('node:fs'), path=require('node:path');
      const walk=(d:string):string[]=>fs.readdirSync(d,{withFileTypes:true}).flatMap((e:any)=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
      const hits=walk(path.join(__dirname,'..','src')).filter((f:string)=>/\.tsx?$/.test(f)&&/followsNoShowOrNegativeReview|followsNegativeReview|NEGATIVE_REVIEW_MAX_RATING|hostNoShowReporters/.test(fs.readFileSync(f,'utf8')));
      ok(hits.length===0,'static: review flag, its helper and hostNoShowReporters removed ('+hits.map((f:string)=>path.basename(f)).join(',')+')');
      const tr=fs.readFileSync(path.join(__dirname,'..','src','utils','tableReports.ts'),'utf8');
      ok(!/\breviews\b|\bReview\b/.test(tr.replace(/\/\*[\s\S]*?\*\//g,'')),'static: tableReports.ts reads no reviews');
    }
  }
  // clos figé
  ok(A(nothing,'closed','warning').tableReports[0].outcome==='sans_suite'&&A(nothing,'open').tableReports[0].status==='closed'&&JSON.stringify(A(nothing,'closed','suspension').memberModeration)==='{}','closed report frozen');
  // abusif sans effet : le motif malaise reste proposé, départ malaise = règle poussée
  ok(LT.isDiscomfortReasonOffered(abus.confidentialLeaveReports,'u1',abus.currentUser.manualReviewRequired,now)===true,'abusive: discomfort reason still offered to reporter');
  const ab2={...abus,outings:[{...abus.outings[0],startsAt:iso(now-5*60e3)}]};
  const pl2={...r2,outings:[{...r2.outings[0],startsAt:iso(now-5*60e3)}]};
  const LV=(s0:any)=>D(s0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason:'discomfort',reportId:'lvx'}});
  const lv=LV(ab2), lvRef=LV(pl2);
  ok(lv.requests[0].depositStatus===lvRef.requests[0].depositStatus&&lv.requests[0].depositStatus!=='forfeited'&&lv.confidentialLeaveReports.length===1,'abusive reporter: discomfort leave accepted as before (caution not lost)');
  ok(JSON.stringify({r:lv.requests,c:lv.confidentialLeaveReports,u:lv.currentUser,p:lv.momentPaidHostLines})===JSON.stringify({r:lvRef.requests,c:lvRef.confidentialLeaveReports,u:lvRef.currentUser,p:lvRef.momentPaidHostLines}),'abusive: leave outcome identical to no report');
  {
    const fs=require('node:fs'), path=require('node:path');
    const walk=(d:string):string[]=>fs.readdirSync(d,{withFileTypes:true}).flatMap((e:any)=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
    const hits=walk(path.join(__dirname,'..','src')).filter((f:string)=>/\.tsx?$/.test(f)&&/discomfortAccessRevoked|'nothing'/.test(fs.readFileSync(f,'utf8')));
    ok(hits.length===0,'static: discomfortAccessRevoked and old « nothing » outcome removed ('+hits.map((f:string)=>path.basename(f)).join(',')+')');
    const ctx=fs.readFileSync(path.join(__dirname,'..','src','data','ChanceContext.tsx'),'utf8');
    ok((ctx.match(/isDiscomfortReasonOffered\(\s*state\.confidentialLeaveReports,\s*(me|user)\.id,\s*(me|user)\.manualReviewRequired,/g)||[]).length===3,'static: discomfort rule = pushed version (manualReviewRequired only, 3 call sites)');
  }
  // compteur hôte : 1 malaise non, 2 en 3 mois oui, 2 hors fenêtre non
  const hs=(prior:any[])=>D(S({currentUser:me,outings:[o({startsAt:iso(now-5*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})],confidentialLeaveReports:prior}),{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason:'discomfort',reportId:'lvh'}});
  const oth=(d:number,guest='u9')=>({id:'p'+d+guest,outingId:'o0',requestId:'r0',guestId:guest,hostId:'h1',reason:'discomfort',createdAt:iso(now-d*24*H)});
  ok(!hs([]).memberModeration.h1?.hostReview,'host: 1 discomfort leave → no review');
  ok(hs([oth(40)]).memberModeration.h1.hostReview===true,'host: 2 in 3 months (other guest) → review');
  ok(!hs([oth(100)]).memberModeration.h1?.hostReview,'host: 2nd outside window → no review');
  ok(!hs([{...oth(10),hostId:'h2'}]).memberModeration.h1?.hostReview,'host: other host leaves not counted');
  {
    const M=Date.parse('2026-05-31T10:00:00Z'), rp=(d:string)=>({hostId:'h1',createdAt:d});
    ok(TR.countRecentHostDiscomfort([rp('2026-03-03T12:00:00Z'),rp('2026-05-30T12:00:00Z')],'h1',M)===2&&TR.countRecentHostDiscomfort([rp('2026-03-02T12:00:00Z'),rp('2026-05-30T12:00:00Z')],'h1',M)===1,'host window: same Paris calendar as guest (31/05 → 03/03)');
  }
  const hr=hs([oth(40)]);
  ok(hr.currentUser.manualReviewRequired!==true,'host review does not touch guest (1st discomfort for u1)');
  // confidentialité : rien côté hôte
  const hostSees=(st:any)=>JSON.stringify({reqs:st.requests.map(LT.projectRequestForHost),views:st.requests.map(LT.hostLeaveView),outings:st.outings});
  ok(hostSees(hr)===hostSees(hs([])),'host review flag invisible in host view');
  ok(hostSees(r2)===hostSees(base(me))&&!/report|signal/i.test(hostSees(r2)),'reports invisible in host view');
  ok(TR.tableReportMessagesFor(r2.tableReports,'h1').length===1&&TR.tableReportMessagesFor(r.tableReports,'h1').length===0,'host gets only the neutral message, after contact step');
}

// Effet de l’abus (3 mois glissants Paris) + revue manuelle préalable + auteur du « Pas venu » invité → hôte (17/10 12 h 29)
{
  const TR=require('../src/utils/tableReports');
  const LT=require('../src/utils/leaveTable');
  const st0=S({currentUser:me,outings:[o({startsAt:iso(now-10*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})]});
  const SUB=(s0:any,id:string,at=now,target='h1')=>D(s0,{type:'SUBMIT_TABLE_REPORT',payload:{id,outingId:'o1',targetUserId:target,category:'insults_aggression',createdAt:iso(at)}});
  const ADV=(s0:any,id:string,to:string,at=now,outcome?:string,abusiveReason?:string)=>D(s0,{type:'ADVANCE_TABLE_REPORT',payload:{reportId:id,to,at:iso(at),outcome,abusiveReason}});
  const closeAbusive=(s0:any,id:string,at=now)=>ADV(ADV(ADV(s0,id,'contact_reporter',at),id,'contact_target',at),id,'closed',at,'abusive','reporter_admitted_false');
  const rp=(st:any,id:string)=>st.tableReports.find((x:any)=>x.id===id);
  // 1er abusif = avertissement (compteur warnings existant) + trace dédiée
  let a1=closeAbusive(SUB(st0,'a1'),'a1');
  ok(a1.memberModeration.u1.warnings===1&&a1.memberModeration.u1.abusiveReportAt.length===1&&!a1.memberModeration.u1.suspended,'abuse 1st: warning (+ dated trace), no suspension');
  let n1=SUB(a1,'n1'); ok(rp(n1,'n1')&&!rp(n1,'n1').requiresManualReviewFirst,'abuse 1st: next report has no manual-review flag');
  // 2e dans les 3 mois = drapeau sur les suivants, transitions bloquées puis levées
  let a2=closeAbusive(n1,'n1');
  ok(a2.memberModeration.u1.warnings===1&&a2.memberModeration.u1.abusiveReportAt.length===2&&!a2.memberModeration.u1.suspended&&a2.currentUser.banned!==true,'abuse 2nd in window: no extra warning, no suspension, no ban');
  let f=SUB(a2,'f1'); ok(rp(f,'f1')&&rp(f,'f1').requiresManualReviewFirst===true&&rp(f,'f1').status==='open','abuse 2nd: reporter keeps right to report, new report flagged');
  let f2=SUB(f,'f2',now,'u2'); ok(rp(f2,'f2').requiresManualReviewFirst===true,'abuse 2nd: every new report flagged');
  ok(rp(ADV(f,'f1','contact_reporter'),'f1').status==='open'&&rp(ADV(f,'f1','closed',now,'sans_suite'),'f1').status==='open','flagged: no transition beyond Ouvert');
  ok(rp(a2,'a1').requiresManualReviewFirst===undefined&&rp(a2,'n1').requiresManualReviewFirst===undefined,'flag only on new reports (past ones untouched)');
  let cl=D(f,{type:'CLEAR_TABLE_REPORT_MANUAL_REVIEW',payload:{reportId:'f1',at:iso(now)}});
  ok(rp(cl,'f1').requiresManualReviewFirst===false&&rp(cl,'f1').manualReviewClearedAt===iso(now),'manual review clears the flag');
  ok(rp(ADV(cl,'f1','contact_reporter'),'f1').status==='contact_reporter','after clearing: transitions possible');
  ok(D(st0,{type:'CLEAR_TABLE_REPORT_MANUAL_REVIEW',payload:{reportId:'zz',at:iso(now)}})===st0||JSON.stringify(D(st0,{type:'CLEAR_TABLE_REPORT_MANUAL_REVIEW',payload:{reportId:'zz',at:iso(now)}}))===JSON.stringify(st0),'clear: unknown report no-op');
  // 2e hors fenêtre = seulement un avertissement
  const old=now-120*24*H;
  let o1=closeAbusive(SUB(st0,'o1x'),'o1x',old);
  ok(o1.memberModeration.u1.warnings===1,'old abuse: warning');
  let o2=closeAbusive(SUB(o1,'o2x'),'o2x');
  ok(o2.memberModeration.u1.warnings===2&&o2.memberModeration.u1.abusiveReportAt.length===2,'2nd outside window: only a warning (counts as 1st in window)');
  ok(!rp(SUB(o2,'o3x'),'o3x').requiresManualReviewFirst,'2nd outside window: no manual-review flag');
  // fenêtre Paris calendaire : même calcul que les autres
  {
    const M=Date.parse('2026-05-31T10:00:00Z');
    ok(TR.countRecentAbusive(['2026-03-03T12:00:00Z','2026-05-30T12:00:00Z'],M)===2&&TR.countRecentAbusive(['2026-03-02T12:00:00Z','2026-05-30T12:00:00Z'],M)===1,'abuse window: Paris calendar (31/05 → 03/03), like discomfort');
    ok(TR.reporterNeedsManualReviewFirst(['2026-03-03T12:00:00Z','2026-05-30T12:00:00Z'],M)&&!TR.reporterNeedsManualReviewFirst(['2026-03-02T12:00:00Z','2026-05-30T12:00:00Z'],M),'manual review threshold on same window');
  }
  // confidentiel : rien côté hôte ni personne visée
  const hostSees=(st:any)=>JSON.stringify({reqs:st.requests.map(LT.projectRequestForHost),views:st.requests.map(LT.hostLeaveView),outings:st.outings});
  ok(hostSees(f2)===hostSees(st0),'abuse effects invisible in host view');
  ok(TR.tableReportMessagesFor(f2.tableReports,'h1').every((m:any)=>m.body===TR.REPORT_TARGET_MESSAGE)&&TR.tableReportMessagesFor(f2.tableReports,'u2').length===0&&!/abus|warning|manual/i.test(JSON.stringify(TR.tableReportMessagesFor(a2.tableReports,'h1'))),'target receives nothing about abuse / review');
  // abus : règle malaise côté invité inchangée
  ok(LT.isDiscomfortReasonOffered(a2.confidentialLeaveReports,'u1',a2.currentUser.manualReviewRequired,now)===true,'abuse: discomfort reason unchanged');
  // « Pas venu » invité → hôte : flux inchangé (aucun auteur enregistré)
  {
    const hn=D(st0,{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false}});
    ok(hn.outings[0].hostNoShowReported===true&&hn.outings[0].status==='closed'&&!hn.hostNoShowStrikes.h1&&!('hostNoShowReporters' in hn),'host no-show: declared, sanction pending, no author map');
    const ST=hn;
    ok(D(ST,{type:'EXPIRE_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso((x=>x?Date.parse(x.reportedAt)+24*H:0)(ST.outings[0].hostNoShowCase))}}).hostNoShowStrikes.h1===1,'host no-show: strike after the 24 h without contest');
    // décision Paolo 17/10 15 h 44 : l’hôte déclaré « Pas venu » ne peut plus signaler sur cette table
    const hostRep=SUB({...hn,currentUser:host},'hr1',now,'u1');
    ok(!rp(hostRep,'hr1')&&!/follows/.test(JSON.stringify(hostRep.tableReports)),'host declared « Pas venu » by guest: report refused, no flag');
  }
}

// Après un départ malaise : « Tu veux signaler ? » (17/10) — séparé du départ
{
  const DP=require('../src/utils/discomfortReportPrompt');
  const TR=require('../src/utils/tableReports');
  const st0=S({currentUser:me,outings:[o({startsAt:iso(now-5*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})]});
  const LV=(reason?:string)=>D(st0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason,reportId:'lvp'}});
  const lvD=LV('discomfort'), lvN=LV();
  // le départ est enregistré avant la question ; le signalement reste ouvert pour l’invité parti (même règle que le chat)
  ok(lvD.requests[0].leftTableAt&&lvD.requests[0].status==='confirmed'&&TR.tableMemberIds(lvD.outings[0],lvD.requests).includes('u1'),'discomfort leave: guest still a member');
  const open=TR.canOpenTableReport(lvD.outings[0],lvD.requests,'u1',now);
  ok(open===true&&C.isOutingChatOpen(lvD.outings[0],now),'discomfort leave: report open for leaver (chat open)');
  ok(DP.shouldOfferReportAfterLeave({ok:true,discomfort:true},open)===true,'prompt after discomfort leave');
  ok(DP.shouldOfferReportAfterLeave({ok:true,discomfort:false},open)===false,'no prompt after leave without reason');
  ok(DP.shouldOfferReportAfterLeave({ok:false},open)===false&&DP.shouldOfferReportAfterLeave({ok:true,discomfort:true},false)===false&&DP.shouldOfferReportAfterLeave(null,true)===false,'no prompt if leave failed or report closed');
  ok(DP.DISCOMFORT_REPORT_PROMPT_TEXT==='Tu veux signaler ?','prompt text');
  // Non : ferme, rien n’est créé
  const no=DP.discomfortReportPromptAction('no','o1');
  ok(no.kind==='close'&&lvD.tableReports.length===0,'No: closes, no report created');
  // Oui : écran Signaler vide (seulement outingId, ni catégorie ni phrase)
  const yes=DP.discomfortReportPromptAction('yes','o1');
  ok(yes.kind==='open_report'&&yes.screen==='ReportTable'&&JSON.stringify(yes.params)==='{"outingId":"o1"}','Yes: opens empty report form (no category / phrase passed)');
  ok(lvD.tableReports.length===0,'Yes then abandon: nothing sent');
  // rien n’est envoyé sans la confirmation normale (catégorie obligatoire) ; ensuite formulaire normal
  ok(D(lvD,{type:'SUBMIT_TABLE_REPORT',payload:{id:'p1',outingId:'o1',targetUserId:'h1',createdAt:iso(now)}}).tableReports.length===0,'empty form cannot be sent');
  const sent=D(lvD,{type:'SUBMIT_TABLE_REPORT',payload:{id:'p1',outingId:'o1',targetUserId:'h1',category:'other',createdAt:iso(now)}});
  ok(sent.tableReports.length===1&&!/follows|rating|review/i.test(JSON.stringify(sent.tableReports)),'normal submit works after leave; no review flag');
  // départ et caution inchangés dans tous les cas ; signalement confidentiel malaise inchangé
  const same=(a:any,b:any)=>JSON.stringify({r:a.requests,c:a.confidentialLeaveReports,p:a.momentPaidHostLines,u:a.currentUser})===JSON.stringify({r:b.requests,c:b.confidentialLeaveReports,p:b.momentPaidHostLines,u:b.currentUser});
  ok(same(sent,lvD),'leave + caution + confidential report unchanged after Yes + submit');
  ok(lvD.requests[0].depositStatus!=='forfeited'&&lvD.confidentialLeaveReports.length===1&&lvD.confidentialLeaveReports[0].reason==='discomfort','discomfort leave: caution returned, confidential report as before');
  ok(lvN.confidentialLeaveReports.length===0&&lvN.tableReports.length===0,'leave without reason: no confidential report, no table report');
  // statique : l’écran n’envoie que outingId et n’utilise pas de bouton plein pour Oui / Non
  const fs=require('node:fs'), path=require('node:path');
  const od=fs.readFileSync(path.join(__dirname,'..','src','screens','OutingDetailScreen.tsx'),'utf8');
  ok(/shouldOfferReportAfterLeave\(res, canReportOnOuting\(outing\.id\)\)/.test(od)&&/navigation\.navigate\(act\.screen, act\.params\)/.test(od),'static: OutingDetail uses the helper');
  ok(/title="Oui"\s*variant="secondary"/.test(od)&&/title="Non"\s*variant="secondary"/.test(od),'static: Oui / Non secondary');
}

// Confidentialité côté hôte (rétabli à la demande du Testeur) : aucune trace de signalement dans la vue hôte
{
  const TR=require('../src/utils/tableReports');
  const LT=require('../src/utils/leaveTable');
  const NOTE='il a été très lourd zq9x';
  const mk=()=>S({currentUser:me,outings:[o({startsAt:iso(now-5*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})]});
  // vue hôte = demandes projetées + mention de départ + annonces + messages reçus par l’hôte
  const hostView=(st:any)=>({reqs:st.requests.filter((r:any)=>r.outingId==='o1').map(LT.projectRequestForHost),views:st.requests.map(LT.hostLeaveView),outings:st.outings,msgs:TR.tableReportMessagesFor(st.tableReports,'h1')});
  const SUB=(st:any,id:string,target='h1',category='sexism',note=NOTE,user=me)=>D({...st,currentUser:user},{type:'SUBMIT_TABLE_REPORT',payload:{id,outingId:'o1',targetUserId:target,category,note,createdAt:iso(now)}});
  const ADV=(st:any,id:string,to:string,outcome?:string,abusiveReason?:string)=>D(st,{type:'ADVANCE_TABLE_REPORT',payload:{reportId:id,to,at:iso(now),outcome,abusiveReason}});
  // « category » seule = catégorie du moment (resto…), pas celle du signalement → on cherche les valeurs de catégorie de signalement
  const FORBID=/tableReport|report|signal|sexism|racism|insults|threats|solicitation|not_the_person|inappropriate|zq9x|lourd|reporterId|targetUserId|requiresManualReview|manualReview|abusive|abusiveReason|warnings|suspended|memberModeration|hostReview|discomfort|malaise|confidential/i;
  // 1) départ malaise puis signalement contre l’hôte (avec phrase)
  const base0=mk();
  const left=D(base0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason:'discomfort',reportId:'lvc'}});
  const leftPlain=D(base0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reportId:'lvc'}});
  const rep=SUB(left,'c1');
  ok(rep.tableReports.length===1&&rep.tableReports[0].note===NOTE&&rep.tableReports[0].category==='sexism','privacy setup: discomfort leave then report recorded');
  ok(JSON.stringify(hostView(rep))===JSON.stringify(hostView(left)),'host view identical with / without report (after discomfort leave)');
  ok(JSON.stringify(hostView(left).reqs)===JSON.stringify(hostView(leftPlain).reqs)&&JSON.stringify(hostView(left).views)===JSON.stringify(hostView(leftPlain).views),'host view: discomfort leave identical to plain leave');
  ok(!FORBID.test(JSON.stringify(hostView(rep))),'host view after discomfort leave + report: no report / category / phrase / author / review / abuse trace');
  ok(rep.requests.filter((r:any)=>r.outingId==='o1').map(LT.projectRequestForHost).every((r:any)=>!FORBID.test(JSON.stringify(r))&&r.depositStatus!=='returned_discomfort_leave'),'projectRequestForHost: no trace, no internal discomfort status');
  // 2) cheminement complet : contact signaleur → contact concerné → issue ; l’hôte ne reçoit que le message neutre
  let full=ADV(ADV(rep,'c1','contact_reporter'),'c1','contact_target');
  ok(JSON.stringify(hostView(full).msgs.map((m:any)=>m.body))===JSON.stringify([TR.REPORT_TARGET_MESSAGE])&&!FORBID.test(JSON.stringify(hostView(full).msgs)),'host (target) receives only the neutral message, no author / category / phrase');
  ok(JSON.stringify({...hostView(full),msgs:[]})===JSON.stringify({...hostView(left),msgs:[]}),'host view otherwise unchanged during review');
  for(const out of [['sans_suite'],['warning'],['suspension'],['abusive','reporter_admitted_false']]){
    const cl=ADV(full,'c1','closed',out[0],out[1]);
    ok(cl.tableReports[0].status==='closed'&&JSON.stringify({...hostView(cl),msgs:[]})===JSON.stringify({...hostView(left),msgs:[]})&&!FORBID.test(JSON.stringify({...hostView(cl),msgs:[]})),'host view unchanged after outcome '+out[0]);
  }
  // 3) abus ×2 contre le signaleur → revue manuelle préalable sur le suivant : rien côté hôte
  let ab=ADV(full,'c1','closed','abusive','reporter_admitted_false');
  ab=SUB(ab,'c2','u2','threats');
  ab=ADV(ADV(ADV(ab,'c2','contact_reporter'),'c2','contact_target'),'c2','closed','abusive','reporter_admitted_false');
  const flagged=SUB(ab,'c3','h1','other');
  ok(flagged.tableReports.find((r:any)=>r.id==='c3').requiresManualReviewFirst===true&&flagged.memberModeration.u1.warnings===1,'privacy setup: 2 abuses → next report needs manual review');
  ok(JSON.stringify({...hostView(flagged),msgs:[]})===JSON.stringify({...hostView(left),msgs:[]})&&!FORBID.test(JSON.stringify({...hostView(flagged),msgs:[]})),'host view: no manual-review / abuse / warning trace');
  ok(hostView(flagged).msgs.every((m:any)=>m.body===TR.REPORT_TARGET_MESSAGE),'host messages: neutral only, even with manual review / abuse');
  // 4) l’hôte comme signaleur ne voit pas les signalements des autres ; projection de chaque demande sans champ de signalement
  const hostRep=SUB(left,'c4','u2','racism','x',host);
  ok(JSON.stringify(hostView(hostRep))===JSON.stringify(hostView(left)),'host view unchanged by a report the host makes / other reports');
  ok(hostRep.requests.map(LT.projectRequestForHost).every((r:any)=>Object.keys(r).every((k)=>!/report|category|note|abus|review|moderation/i.test(k))),'projectRequestForHost: no report-related keys');
}

// caution H+6 (décision Paolo 17/10) : la caution évite le no-show, la note n’a aucun effet sur l’argent
{
  const DH=require('../src/utils/depositH6');
  const MIN=60e3, T=now-10*H, H6=T+6*H; // début du moment, H+6
  ok(DH.DEPOSIT_SILENCE_RETURN_AFTER_MS===6*H,'H+6: named constant = 6 h');
  const st=(x:any={},ox:any={},more:any={})=>S({outings:[o({startsAt:iso(T),status:'closed',...ox})],requests:[rq({status:'confirmed',depositStatus:'held',...x})],...more});
  const R6=(s0:any,at:number)=>D(s0,{type:'RETURN_DEPOSITS_H6',payload:{outingId:'o1',at:iso(at)}});
  const NS=(s0:any,at:number)=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(at)}});
  // invité silencieux : rendue à H+6, pas à H+6 − 1 min
  ok(R6(st(),H6).requests[0].depositStatus==='returned','silent guest: returned at H+6');
  ok(R6(st(),H6-MIN).requests[0].depositStatus==='held','H+6 action refused before time (H+6 − 1 min)');
  ok(R6(st(),T+30*MIN).requests[0].depositStatus==='held','H+6 action refused at H+30');
  ok(DH.shouldReturnDepositH6(o({startsAt:iso(T)}),rq({status:'confirmed',depositStatus:'held'}),H6)&&!DH.shouldReturnDepositH6(o({startsAt:iso(T)}),rq({status:'confirmed',depositStatus:'held'}),H6-MIN),'helper: due at H+6, not at H+6 − 1 min');
  ok(JSON.stringify(DH.outingsDueForH6([o({startsAt:iso(T)})],[rq({status:'confirmed',depositStatus:'held'})],H6))==='["o1"]'&&DH.outingsDueForH6([o({startsAt:iso(T)})],[rq({status:'confirmed',depositStatus:'held'})],H6-MIN).length===0,'timer helper: outings due at H+6 only');
  // idempotent
  const once=R6(st(),H6), twice=R6(once,H6+H);
  ok(twice===once||JSON.stringify(twice)===JSON.stringify(once),'H+6 action idempotent');
  // non-confirmé / annulé : intact
  ok(R6(st({status:'accepted'}),H6).requests[0].depositStatus==='held'&&R6(st({},{status:'cancelled'}),H6).requests[0].depositStatus==='held','H+6: only confirmed, not cancelled outings');
  // « Pas venu » : accepté à H+6 − 1 min, refusé à H+6
  const nsOk=NS(st(),H6-MIN);
  ok(nsOk.requests[0].attendance==='absent'&&nsOk.requests[0].depositStatus==='forfeited','« Pas venu » accepted at H+6 − 1 min');
  const nsKo=NS(st(),H6);
  ok(nsKo.requests[0].attendance===undefined&&nsKo.requests[0].depositStatus==='held'&&!(nsKo.guestNoShowStrikes?.u1),'« Pas venu » refused at H+6 (reducer)');
  ok(DH.isNoShowWindowOpen(o({startsAt:iso(T)}),H6-MIN)&&!DH.isNoShowWindowOpen(o({startsAt:iso(T)}),H6),'model: no-show window closes at H+6 (button hidden)');
  // « Pas venu » avant H+6 → 6,90 / 13,10, pas défait à H+6
  ok(PR.DEPOSIT_FORFEIT_CHANCE_EUROS===6.9&&PR.DEPOSIT_FORFEIT_HOST_EUROS===13.1,'« Pas venu » split 6,90 / 13,10');
  const ns6=R6(nsOk,H6+MIN);
  ok(ns6.requests[0].depositStatus==='forfeited'&&ns6.requests[0].attendance==='absent','« Pas venu » before H+6 not undone at H+6');
  ok(NS(R6(st(),H6),H6+MIN).requests[0].depositStatus==='returned','returned at H+6 then « Pas venu » refused');
  // présent : H+30 et clôture inchangés ; présence marquée après H+6 = sans effet sur la caution rendue
  const pres=D(st({},{startsAt:iso(now+10*MIN)}),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now)}});
  ok(pres.requests[0].attendance==='present'&&pres.requests[0].depositStatus==='held','present before H+30: held (unchanged)');
  ok(D(pres,{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'auto',at:iso(now+40*MIN)}}).requests[0].depositStatus==='returned','present: returned at closure / H+30 (unchanged)');
  ok(D(st(),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(now)}}).requests[0].depositStatus==='returned','present marked ≥ H+30: returned now (unchanged)');
  const late=D(R6(st(),H6),{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(H6+H)}});
  ok(late.requests[0].attendance==='present'&&late.requests[0].depositStatus==='returned','presence marked after H+6 still possible, deposit stays returned');
  // notes 1 à 5 : aucun effet sur la caution (invité et hôte)
  {
    const g2=rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'});
    const c0=D(st({attendance:'present'},{},{requests:[rq({status:'confirmed',depositStatus:'held',attendance:'present'}),g2]}),{type:'COMPLETE_OUTING',payload:{outingId:'o1',by:'auto',at:iso(T+40*MIN)}});
    const dep=(x:any)=>JSON.stringify(x.requests.map((r:any)=>[r.id,r.depositStatus,r.attendance]));
    let same=true;
    for(const rating of [1,2,3,4,5]){
      const rv=(id:string,from:string,to:string)=>({id,outingId:'o1',fromUserId:from,toUserId:to,rating,venueRating:rating,venueKey:'k',createdAt:iso(T+2*H)});
      const a=D({...c0,currentUser:me},{type:'ADD_REVIEW',payload:rv('rg'+rating,'u1','h1')});
      const b=D({...a,currentUser:host},{type:'ADD_REVIEW',payload:rv('rh'+rating,'h1','u1')});
      if(!(a.reviews.some((x:any)=>x.id==='rg'+rating)&&b.reviews.some((x:any)=>x.id==='rh'+rating))) same=false;
      if(dep(a)!==dep(c0)||dep(b)!==dep(c0)) same=false;
      if(dep(R6(b,H6))!==dep(R6(c0,H6))) same=false;
    }
    ok(same,'ratings 1–5 (guest and host): no effect on deposits, before or after H+6');
    ok(R6(c0,H6).requests.find((r:any)=>r.id==='r2').depositStatus==='returned','silent guest beside present one: returned at H+6');
  }
  // partenaire : inchangé
  {
    const pst=st({},{isPartnerListing:true});
    ok(P.isPartnerListing(pst.outings[0]),'partner fixture');
    ok(R6(pst,H6+H).requests[0].depositStatus==='held','partner: H+6 action has no effect');
    ok(DH.outingsDueForH6(pst.outings,pst.requests,H6+H).length===0&&DH.isNoShowWindowOpen(pst.outings[0],H6+H),'partner: no H+6 timer, no H+6 no-show bound');
    ok(NS(pst,H6+MIN).requests[0].depositStatus==='forfeited','partner: « Pas venu » not bounded by H+6 (same-evening rule unchanged)');
    ok(D(pst,{type:'RETURN_DEPOSIT_SILENCE',payload:{requestId:'r1'}}).requests[0].depositStatus==='returned','partner: next-day silence return unchanged');
  }
  // imprévu refusé après H+6 : pas de perte ; avant H+6 : inchangé
  {
    const imp={id:'i1',outingId:'o1',requestId:'r1',reporterId:'u1',reporterName:'Moi',responderIds:['h1'],motive:'autre',reason:'x',status:'pending',createdAt:iso(T-H)};
    const b0=st({},{},{imprevuReports:[imp]});
    const RI=(s0:any,decision:string,at:number)=>D(s0,{type:'RESPOND_IMPREVU',payload:{imprevuId:'i1',decision,respondedAt:iso(at),respondedByUserId:decision==='refused'?'h1':undefined,forfeitReporterDeposit:true}});
    const r1=RI(b0,'refused',H6), r2=RI(b0,'auto_refused',H6+MIN);
    ok(r1.imprevuReports[0].status==='refused'&&r1.requests[0].depositStatus==='held'&&R6(r1,H6).requests[0].depositStatus==='returned','imprévu refused at H+6: no loss, returned');
    ok(r2.imprevuReports[0].status==='auto_refused'&&r2.requests[0].depositStatus!=='forfeited','imprévu auto-refused after H+6: no loss');
    ok(RI(R6(b0,H6),'refused',H6+MIN).requests[0].depositStatus==='returned','imprévu refused after H+6 return: stays returned');
    ok(RI(b0,'auto_refused',T).requests[0].depositStatus==='forfeited','imprévu auto-refused at H: forfeits (unchanged)');
  }
  // départ sans motif / malaise : inchangés, intacts à H+6
  {
    const sl=st({},{startsAt:iso(now-10*MIN)});
    const L=(s0:any,reason?:any)=>D(s0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason,reportId:'lvh6'}});
    const a=L(sl), b=L(sl,'discomfort');
    const at6=now-10*MIN+6*H;
    ok(a.requests[0].depositStatus==='forfeited'&&R6(a,at6).requests[0].depositStatus==='forfeited','leave without reason < H+30: forfeited, untouched at H+6');
    ok(b.requests[0].depositStatus==='returned_discomfort_leave'&&R6(b,at6).requests[0].depositStatus==='returned_discomfort_leave'&&b.momentPaidHostLines[0].amountEuros===13.1,'malaise: refunded, host 13,10 € by Moment, untouched at H+6');
  }
  // statique : bouton « Signaler absence » masqué à H+6 ; minuterie locale ; démo gardée et absente du menu prod
  {
    const fs=require('node:fs'), path=require('node:path');
    const rd=(f:string)=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8');
    const od=rd('screens/OutingDetailScreen.tsx'), ctx=rd('data/ChanceContext.tsx'), dm=rd('components/DemoMenuModal.tsx');
    const bi=od.indexOf('title={`Signaler absence de ${r.userName}`}');
    ok(bi>0&&od.slice(bi-500,bi).includes('isNoShowWindowOpen(outing)'),'static: « Signaler absence » hidden from H+6');
    ok(/type: 'RETURN_DEPOSITS_H6'[\s\S]{0,200}at: new Date\(now\)/.test(ctx)&&/outingsDueForH6\(state\.outings, state\.requests, now\)[\s\S]{0,600}setInterval\(tick, 60_000\)[\s\S]{0,200}'active'/.test(ctx),'static: local H+6 timer (interval + foreground)');
    ok(/reason: 'too_late'/.test(ctx),'static: reportGuestNoShow returns too_late from H+6');
    ok(dm.includes('title="Simuler H+6"')&&dm.includes('title="Simuler sortie terminée"'),'demo: « Simuler H+6 » added, « Simuler sortie terminée » kept');
    (globalThis as any).__DEV__=false;
    const DM2=require('../src/utils/devMode');
    ok(DM2.isDemoEnabled()===false,'H+6 demo inert when __DEV__ false');
    (globalThis as any).__DEV__=true;
  }
}

// profil : phrase « Pas pour draguer… » retirée (Paolo 17/10, 15 h 44)
{
  const fs=require('node:fs'), path=require('node:path');
  const ep=fs.readFileSync(path.join(__dirname,'..','src','screens','EditProfileScreen.tsx'),'utf8');
  ok(!/draguer/.test(ep)&&!ep.includes('il sert à l’option'),'edit profile: « Pas pour draguer » sentence removed');
  ok(/<Text style=\{styles\.label\}>Genre \(optionnel\)<\/Text>\s*<GenderPills/.test(ep),'edit profile: gender label directly followed by pills (no empty hint)');
}

// hôte déclaré « Pas venu » : ne signale personne, cautions rendues ; signalement ouvert avant un « Pas venu » maintenu (Paolo 17/10, 15 h 44)
{
  const TRx=require('../src/utils/tableReports');
  const NOTEx='Il a eu des propos déplacés pendant le dîner.';
  const T0=now-10*60e3;
  const g1=rq({status:'confirmed',depositStatus:'held'}), g2=rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'});
  const base=(rx:any[]=[g1,g2])=>S({currentUser:me,outings:[o({startsAt:iso(T0),status:'closed'})],requests:rx});
  const SUBx=(st:any,id:string,user:any,target:string)=>D({...st,currentUser:user},{type:'SUBMIT_TABLE_REPORT',payload:{id,outingId:'o1',targetUserId:target,category:'sexism',note:NOTEx,createdAt:iso(now)}});
  const ADVx=(st:any,id:string,to:string,outcome?:string)=>D(st,{type:'ADVANCE_TABLE_REPORT',payload:{reportId:id,to,at:iso(now),outcome}});
  const HNS=(st:any)=>((ST:any)=>ST.outings[0].hostNoShowCase?D(ST,{type:'EXPIRE_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso((x=>x?Date.parse(x.reportedAt)+24*H:0)(ST.outings[0].hostNoShowCase))}}):ST)(D(D(st,{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false}}),{type:'RETURN_DEPOSITS_FOR_OUTING',payload:{outingId:'o1',reason:'host_no_show'}}));
  const GNS=(st:any,rid='r1',uid='u1')=>D(st,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:rid,guestId:uid,strike:1,lowerPriority:false,reportedAt:iso(now)}});
  const b0=base();
  ok(TRx.canOpenTableReport(b0.outings[0],b0.requests,'h1',now)&&TRx.canOpenTableReport(b0.outings[0],b0.requests,'u1',now),'setup: host and guest can report before any « Pas venu »');
  // 2) hôte déclaré « Pas venu »
  const hn=HNS(b0);
  ok(hn.outings[0].hostNoShowReported===true&&TRx.isHostMarkedNoShow(hn.outings[0],'h1')&&!TRx.isHostMarkedNoShow(hn.outings[0],'u1'),'host no-show: model flag');
  ok(!TRx.canOpenTableReport(hn.outings[0],hn.requests,'h1',now)&&!TRx.canSubmitTableReport(hn.outings[0],hn.requests,'h1','u1',now),'host no-show: host cannot report anyone (model)');
  ok(SUBx(hn,'hx',host,'u1').tableReports.length===0&&SUBx(hn,'hy',host,'u2').tableReports.length===0,'host no-show: host report refused (reducer)');
  ok(TRx.canOpenTableReport(hn.outings[0],hn.requests,'u1',now)&&SUBx(hn,'gx',me,'h1').tableReports.length===1,'host no-show: guests can still report');
  ok(hn.requests.every((r:any)=>r.depositStatus==='returned'),'host no-show: guests’ deposits returned (RETURN_DEPOSITS_FOR_OUTING)');
  const pres=HNS(base([rq({status:'confirmed',depositStatus:'held',attendance:'present'}),g2]));
  ok(pres.requests.every((r:any)=>r.depositStatus==='returned'),'host no-show: present guest’s held deposit returned too');
  const hng=GNS(hn);
  ok(hng.requests[0].attendance===undefined&&hng.requests[0].depositStatus==='returned'&&!(hng.guestNoShowStrikes?.u1),'host no-show: later « Pas venu » on a guest refused (reducer)');
  ok(HNS(hn)===hn||JSON.stringify(HNS(hn))===JSON.stringify(hn),'host no-show: idempotent');
  // 3) signalement ouvert avant un « Pas venu » : maintenu, revue normale — invité
  const gr=SUBx(b0,'c1',me,'h1');
  ok(gr.tableReports.length===1,'setup: guest report open');
  const grn=GNS({...gr,currentUser:host});
  ok(grn.requests[0].attendance==='absent'&&grn.tableReports.length===1&&grn.tableReports[0].status===gr.tableReports[0].status,'guest marked « Pas venu » after reporting: report kept');
  ok(!TRx.canOpenTableReport(grn.outings[0],grn.requests,'u1',now)&&SUBx(grn,'c1b',me,'u2').tableReports.length===1,'guest « Pas venu »: no new report');
  let gflow=ADVx(ADVx(grn,'c1','contact_reporter'),'c1','contact_target');
  ok(gflow.tableReports[0].status==='contact_target','guest report: review continues after « Pas venu »');
  gflow=ADVx(gflow,'c1','closed','warning');
  ok(gflow.tableReports[0].status==='closed'&&gflow.tableReports[0].outcome==='warning','guest report: normal outcome after « Pas venu »');
  // 3) — hôte
  const hr=SUBx(b0,'c2',host,'u1');
  ok(hr.tableReports.length===1,'setup: host report open');
  const hrn=HNS(hr);
  ok(hrn.tableReports.length===1&&hrn.tableReports[0].status===hr.tableReports[0].status,'host declared « Pas venu » after reporting: report kept');
  let hflow=ADVx(ADVx(hrn,'c2','contact_reporter'),'c2','contact_target');
  hflow=ADVx(hflow,'c2','closed','sans_suite');
  ok(hflow.tableReports[0].status==='closed'&&hflow.tableReports[0].outcome==='sans_suite','host report: normal review to the end after host « Pas venu »');
  // écran : lien « Signaler » piloté par le modèle, bouton « Signaler absence » masqué
  const fs=require('node:fs'), path=require('node:path');
  const od=fs.readFileSync(path.join(__dirname,'..','src','screens','OutingDetailScreen.tsx'),'utf8');
  const bi=od.indexOf('title={`Signaler absence de ${r.userName}`}');
  ok(od.slice(bi-500,bi).includes('!outing.hostNoShowReported'),'static: « Signaler absence » hidden after host no-show');
  ok(/canReportOnOuting\(outing\.id\) \? \(/.test(od),'static: report link gated by canReportOnOuting (model)');
}

// ligne hôte « caution rendue 6 h après le début » : seulement si rendue par la règle H+6 ; codes bruts traduits
{
  const DH=require('../src/utils/depositH6');
  const RL=require('../src/utils/refusalLabels');
  const T=now-7*H;
  const st=()=>S({currentUser:host,outings:[o({startsAt:iso(T),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})]});
  const R6=(s0:any)=>D(s0,{type:'RETURN_DEPOSITS_H6',payload:{outingId:'o1',at:iso(now)}});
  const HNS=(s0:any)=>((ST:any)=>ST.outings[0].hostNoShowCase?D(ST,{type:'EXPIRE_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso((x=>x?Date.parse(x.reportedAt)+24*H:0)(ST.outings[0].hostNoShowCase))}}):ST)(D(D(s0,{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false,reportedAt:iso(T+H)}}),{type:'RETURN_DEPOSITS_FOR_OUTING',payload:{outingId:'o1',reason:'host_no_show'}}));
  const h6=R6(st());
  ok(h6.requests.every((r:any)=>r.depositReturnCause==='h6')&&DH.hostReturnedDepositLine(h6.requests[0],h6.outings[0])==='Moi · caution rendue 6 h après le début','H+6 return: cause recorded, H+6 line');
  const hn=HNS(st());
  ok(hn.requests.every((r:any)=>r.depositStatus==='returned'&&r.depositReturnCause===undefined),'host « Pas venu »: returned, no H+6 cause (even past H+6)');
  ok(hn.requests.every((r:any)=>!/6 h/.test(DH.hostReturnedDepositLine(r,hn.outings[0])??''))&&DH.hostReturnedDepositLine(hn.requests[0],hn.outings[0])==='Moi · caution rendue','host « Pas venu »: no H+6 line, neutral label');
  const hn6=R6(hn);
  ok(JSON.stringify(hn6.requests)===JSON.stringify(hn.requests),'host « Pas venu » then H+6 tick: cause unchanged');
  ok(DH.hostReturnedDepositLine({userName:'X',depositStatus:'returned'},o({startsAt:iso(T)}))==='X · caution rendue 6 h après le début','other return cause (joker…) at/after H+6: same label as silence (C)');
  // malaise : vue hôte identique à un départ simple
  const sl=S({currentUser:me,outings:[o({startsAt:iso(now-10*60e3),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})]});
  const L=(reason?:any)=>D(sl,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason,reportId:'lv'}});
  const LT=require('../src/utils/leaveTable');
  const a=R6({...L(),outings:[{...L().outings[0],startsAt:iso(T)}]}), b=R6({...L('discomfort'),outings:[{...L('discomfort').outings[0],startsAt:iso(T)}]});
  ok(DH.hostReturnedDepositLine(LT.projectRequestForHost(a.requests[0]),a.outings[0])===null&&DH.hostReturnedDepositLine(LT.projectRequestForHost(b.requests[0]),b.outings[0])===null&&JSON.stringify(LT.projectRequestForHost(a.requests[0]))===JSON.stringify(LT.projectRequestForHost(b.requests[0])),'malaise vs plain leave: same host view, no deposit line, untouched by H+6');
  // codes bruts → français
  const codes=['too_late','host_no_show','too_early','not_participant','not_confirmed','not_found','outing_cancelled','already_present','no_user','not_allowed_now','demo_disabled','outing_not_found','invalid_start'];
  ok(codes.every((c)=>RL.REFUSAL_CODES.includes(c)&&!/[a-z]+_[a-z]+/.test(RL.refusalLabel(c))&&RL.refusalLabel(c).length>5),'refusal labels: every code in clear French');
  ok(RL.refusalLabel('zzz_unknown')===RL.REFUSAL_FALLBACK&&!/_/.test(RL.REFUSAL_FALLBACK),'refusal labels: unknown code → generic French');
  ok(RL.refusalLabel('too_late').includes('6 h')&&RL.refusalLabel('host_no_show').includes('« Pas venu »'),'too_late / host_no_show labels');
  const fs=require('node:fs'), path=require('node:path');
  const rd=(f:string)=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8');
  const od=rd('screens/OutingDetailScreen.tsx'), dm=rd('components/DemoMenuModal.tsx');
  const raw=(src:string,call:string)=>{const out:string[]=[];let i=-1;while((i=src.indexOf(call,i+1))>=0){const nx=src.indexOf('onPress',i+1);const w=src.slice(i,nx>0?nx:i+1500);if(/Alert\.alert\([^)]*\b(res|r)\.reason\)/.test(w)&&!/refusalLabel\((res|r)\.reason\)/.test(w))out.push(String(i));if(/\$\{(res|r)\.reason\}/.test(w))out.push('tpl'+i);}return out;};
  ok(raw(od,'reportGuestNoShow(').length===0&&raw(od,'partnerMarkNoShow(').length===0&&raw(dm,'reportGuestNoShow(').length===0&&raw(dm,'demoSimulateDepositH6(').length===0,'static: no raw code in « Pas venu » / H+6 alerts');
  ok(!od.includes('isAtOrAfterH6(outing)')&&od.includes('hostReturnedDepositLine(r, outing)'),'static: host line driven by recorded cause, not by the clock');
}

// libellés d’alerte par parcours (remarques Testeur 1, 2, 3, 5)
{
  const RL=require('../src/utils/refusalLabels');
  const snake=/[a-z]+_[a-z]+/;
  ok(RL.refusalLabel('too_late').endsWith('La caution est rendue d’office.')&&!RL.refusalLabel('too_late').includes('a été rendue'),'too_late: « La caution est rendue d’office. »');
  const nn=RL.refusalLabel('not_allowed_now'), np=RL.refusalLabel('not_allowed_now','partner_noshow');
  ok(!/soir même/.test(nn)&&nn.includes('6 h'),'not_allowed_now (table normale): avant H+6, plus « le soir même »');
  ok(!/soir même/.test(np)&&np.includes('jour du moment')&&!np.includes('6 h'),'not_allowed_now (partenaire): règle du jour du moment');
  const hp=RL.refusalLabel('not_participant'), pp=RL.refusalLabel('not_participant','partner_noshow');
  ok(hp!==pp&&pp.includes('lieu')&&!pp.includes('hôte')&&hp!=='Seul l’hôte de la table peut le faire.','not_participant: libellé propre au parcours partenaire');
  ok(RL.refusalLabel('too_early','presence').includes('15 min')&&RL.refusalLabel('not_host','presence').includes('présence')&&RL.refusalLabel('already_absent','presence').includes('« Pas venu »'),'presence: too_early / not_host / already_absent labels');
  const all=[...RL.REFUSAL_CODES,'zzz_unknown'];
  ok(['noshow','partner_noshow','presence'].every((f)=>all.every((c)=>!snake.test(RL.refusalLabel(c,f))&&RL.refusalLabel(c,f).length>5)),'every code × every flow: clear French, no raw code');
  const fs=require('node:fs'), path=require('node:path');
  const od=fs.readFileSync(path.join(__dirname,'..','src','screens','OutingDetailScreen.tsx'),'utf8');
  const after=(call:string)=>{const i=od.indexOf(call);const nx=od.indexOf('onPress',i+1);return od.slice(i,nx>0?nx:i+1500);};
  ok(/refusalLabel\(res\.reason, 'presence'\)/.test(after('markGuestPresent(r.id)'))&&!/Alert\.alert\('Impossible', res\.reason\)/.test(after('markGuestPresent(r.id)')),'« Marquer présent »: refusal through refusalLabels');
  ok((od.match(/partnerMarkNoShow\(r\.id\);\s*if \(!res\.ok\) Alert\.alert\('Impossible', refusalLabel\(res\.reason, 'partner_noshow'\)\)/g)||[]).length===2,'partnerMarkNoShow alerts: partner flow labels');
}

// contestation d’un « Pas venu » de l’hôte : 24 h, phrase obligatoire, revue (Paolo 17/10, 15 h 44 — délai 24 h)
{
  const NC=require('../src/utils/noShowContest');
  const DH=require('../src/utils/depositH6');
  const LT=require('../src/utils/leaveTable');
  const MIN=60e3, T=now-2*H; // début ; « Pas venu » déclaré à T+1 h
  const NSAT=T+H, DL=NSAT+24*H;
  ok(NC.NOSHOW_CONTEST_WINDOW_MS===24*H,'contest: named constant = 24 h');
  const g2=rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'});
  const st=(ox:any={},rx:any={})=>S({currentUser:host,outings:[o({startsAt:iso(T),status:'closed',...ox})],requests:[rq({status:'confirmed',depositStatus:'held',...rx}),g2]});
  const NS=(s0:any,by:any='h1',at=NSAT)=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(at),reportedByUserId:by}});
  const CT=(s0:any,at:number,note='J’étais à la table, l’hôte est parti tôt.',user=me)=>D({...s0,currentUser:user},{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note,at:iso(at)}});
  const EXP=(s0:any,at:number)=>D(s0,{type:'EXPIRE_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(at)}});
  const CONF=(s0:any)=>D(s0,{type:'CONFIRM_NO_SHOW_AFTER_REVIEW',payload:{requestId:'r1',at:iso(DL+H)}});
  const ACC=(s0:any)=>D(s0,{type:'ACCEPT_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(DL+H)}});
  const R6=(s0:any,at:number)=>D(s0,{type:'RETURN_DEPOSITS_H6',payload:{outingId:'o1',at:iso(at)}});
  const p0=NS(st());
  const r0=p0.requests[0];
  ok(r0.attendance==='absent'&&r0.depositStatus==='noshow_pending'&&r0.noShowReportedAt===iso(NSAT),'host « Pas venu »: deposit pending 24 h (neither lost nor returned)');
  ok(NS(st(),'u1').requests[0].depositStatus==='forfeited','self-declared absence: no contest, lost (unchanged)');
  ok(!NS(st()).guestNoShowStrikes.u1,'host « Pas venu »: no strike at declaration (B1)');
  // H+6 : jamais pendant les 24 h ni pendant la revue (même si les 24 h dépassent H+6)
  ok(DL>T+6*H,'setup: 24 h window extends past H+6');
  const r6=R6(p0,T+6*H+MIN);
  ok(r6.requests[0].depositStatus==='noshow_pending'&&r6.requests[1].depositStatus==='returned','H+6: no effect during the 24 h (other silent guest returned)');
  ok(!DH.shouldReturnDepositH6(p0.outings[0],p0.requests[0],T+6*H+MIN),'H+6 helper: excludes « Pas venu » guest');
  const c0=CT(p0,DL-MIN);
  ok(R6(c0,T+20*H).requests[0].depositStatus==='contested','H+6: no effect during review');
  ok(D(c0,{type:'RETURN_DEPOSITS_FOR_OUTING',payload:{outingId:'o1',reason:'host_no_show'}}).requests[0].depositStatus==='contested'&&D(p0,{type:'RETURN_DEPOSITS_FOR_OUTING',payload:{outingId:'o1',reason:'host_no_show'}}).requests[0].depositStatus==='noshow_pending','bulk return does not settle pending / contested');
  // perte à 24 h, pas à 24 h − 1 min
  ok(EXP(p0,DL-MIN).requests[0].depositStatus==='noshow_pending','no loss at 24 h − 1 min (expiry refused before time)');
  const e24=EXP(p0,DL);
  ok(e24.requests[0].depositStatus==='forfeited','uncontested at 24 h: lost');
  ok(PR.DEPOSIT_FORFEIT_CHANCE_EUROS===6.9&&PR.DEPOSIT_FORFEIT_HOST_EUROS===13.1,'loss split unchanged 6,90 / 13,10');
  ok(JSON.stringify(EXP(e24,DL+H))===JSON.stringify(e24),'expiry idempotent');
  ok(JSON.stringify(NC.requestsDueForContestExpiry(p0.requests,DL))==='["r1"]'&&NC.requestsDueForContestExpiry(p0.requests,DL-MIN).length===0,'timer helper: due at 24 h only');
  // contestation acceptée à 24 h − 1 min, refusée à 24 h
  ok(c0.requests[0].depositStatus==='contested'&&c0.requests[0].noShowContest.note.length>0,'contest accepted at 24 h − 1 min → under review');
  ok(CT(p0,DL).requests[0].depositStatus==='noshow_pending','contest refused at 24 h');
  ok(EXP(c0,DL).requests[0].depositStatus==='contested','contested: no loss at 24 h');
  // phrase obligatoire, invité concerné seulement
  ok(CT(p0,NSAT+H,'   ').requests[0].depositStatus==='noshow_pending'&&CT(p0,NSAT+H,'').requests[0].depositStatus==='noshow_pending','contest: sentence required');
  ok(CT(p0,NSAT+H,'x',host).requests[0].depositStatus==='noshow_pending'&&CT(p0,NSAT+H,'x',{id:'u2',firstName:'Bea'}).requests[0].depositStatus==='noshow_pending','contest: only the guest concerned');
  ok(NC.contestRefusal(p0.requests[0],'u1','',NSAT)==='note_required'&&NC.contestRefusal(p0.requests[0],'u1','ok',DL)==='too_late'&&NC.contestRefusal(p0.requests[0],'u2','ok',NSAT)==='not_guest','contest refusal reasons');
  ok(JSON.stringify(CT(c0,DL-MIN,'encore'))===JSON.stringify(c0),'contest only once');
  // revue
  const conf=CONF(c0), acc=ACC(c0);
  ok(conf.requests[0].depositStatus==='forfeited'&&conf.requests[0].noShowContest.outcome==='noshow_confirmed','review « Pas venu confirmé » → lost (usual split)');
  ok(acc.requests[0].depositStatus==='returned'&&acc.requests[0].noShowContest.outcome==='contest_accepted','review « contestation acceptée » → returned');
  ok(CONF(p0).requests[0].depositStatus==='noshow_pending'&&ACC(p0).requests[0].depositStatus==='noshow_pending'&&ACC(e24).requests[0].depositStatus==='forfeited','review actions only on a contested deposit');
  ok(JSON.stringify(ACC(acc))===JSON.stringify(acc)&&JSON.stringify(CONF(acc))===JSON.stringify(acc),'review: decided once');
  // invisible pour l’hôte : même projection pendant le délai et la revue, aucune trace de la contestation
  const hv=(x:any)=>JSON.stringify(LT.projectRequestForHost(x.requests[0]));
  ok(LT.hostDepositStatus(p0.requests[0])==='noshow_pending'&&LT.hostDepositStatus(c0.requests[0])==='noshow_pending','host: same view during 24 h and review');
  ok(!/contest|J’étais|noShowContest/.test(hv(c0)),'host projection: no contest field / sentence');
  ok(hv(p0)===hv(c0),'host view identical contested / not contested');
  // hors périmètre : départ sans motif, malaise ; partenaire : même contestation (17/10)
  const pst=NS(st({isPartnerListing:true}));
  ok(pst.requests[0].depositStatus==='noshow_pending'&&CT(pst,NSAT+MIN).requests[0].depositStatus==='contested','partner « Pas venu »: same contest (24 h, sentence)');
  {
    const sl=S({currentUser:me,outings:[o({startsAt:iso(now-10*MIN),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})]});
    const L=(s0:any,reason?:any)=>D(s0,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason,reportId:'lvc'}});
    const a=L(sl), b=L(sl,'discomfort');
    ok(CT(a,now+MIN).requests[0].depositStatus==='forfeited'&&!CT(a,now+MIN).requests[0].noShowContest,'leave without reason: no contest');
    ok(CT(b,now+MIN).requests[0].depositStatus==='returned_discomfort_leave','malaise: no contest');
  }
  // pendant le délai : pas de départ, d’annulation, de présence ni d’imprévu qui règle la caution
  ok(D({...p0,currentUser:me},{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(NSAT+MIN),reportId:'z'}}).requests[0].depositStatus==='noshow_pending','pending: leave table does not settle');
  ok(D(p0,{type:'MARK_GUEST_PRESENT',payload:{requestId:'r1',markedAt:iso(NSAT+MIN)}}).requests[0].depositStatus==='noshow_pending','pending: presence does not settle');
  const JE=require('../src/utils/jokerExemption');
  ok(JE.resolveGuestCancelDeposit({by:'guest',freeWindow:false,jokerExempted:false,currentDeposit:'noshow_pending'})==='noshow_pending'&&JE.resolveGuestCancelDeposit({by:'host',freeWindow:true,jokerExempted:false,currentDeposit:'contested'})==='contested','pending / contested: cancellation does not settle');
  // statique : minuterie locale, encart invité, mention hôte
  const fs=require('node:fs'), path=require('node:path');
  const rd=(f:string)=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8');
  const ctx=rd('data/ChanceContext.tsx'), od=rd('screens/OutingDetailScreen.tsx'), card=rd('components/NoShowContestCard.tsx');
  ok(/requestsDueForContestExpiry\(state\.requests, now\)[\s\S]{0,300}EXPIRE_NO_SHOW_CONTEST[\s\S]{0,900}setInterval\(tick, 60_000\)[\s\S]{0,200}'active'/.test(ctx),'static: local 24 h timer (interval + foreground)');
  ok(/reportedByUserId: user\.id/.test(ctx),'static: reportGuestNoShow passes the author');
  ok(od.includes('<NoShowContestCard')&&card.includes('title="Contester"')&&card.includes('variant="secondary"')&&card.includes('contestTimeLeftLabel')&&!/shadow|elevation/i.test(card),'static: guest « Contester » card, time left, secondary button, no shadow');
  ok(od.includes('absence signalée · caution en attente'),'static: host sees « caution en attente »');
  ok(NC.contestTimeLeftLabel(p0.requests[0],NSAT+60*MIN+30e3)==='23 h 00'&&NC.contestTimeLeftLabel(p0.requests[0],DL-12*MIN)==='12 min','time-left label');
}

// contestation v2 : montant via DEPOSIT_EUROS, refus en français, « sans contestation »
{
  const NC=require('../src/utils/noShowContest');
  const fs=require('node:fs'), path=require('node:path');
  const rd=(f:string)=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8');
  const card=rd('components/NoShowContestCard.tsx'), ctx=rd('data/ChanceContext.tsx'), od=rd('screens/OutingDetailScreen.tsx');
  ok(!/\d+\s*€/.test(card)&&card.includes('{DEPOSIT_EUROS} €'),'contest card: no hard-coded amount, DEPOSIT_EUROS');
  const codes=['not_guest','not_pending','too_late','note_required','not_found','no_user'];
  ok(codes.every((c)=>NC.CONTEST_REFUSAL_CODES.includes(c)&&!/[a-z]+_[a-z]+/.test(NC.contestRefusalLabel(c))&&NC.contestRefusalLabel(c).length>5),'contest refusals: every code in clear French');
  ok(NC.contestRefusalLabel('too_late').includes('24 h')&&!/_/.test(NC.contestRefusalLabel('zzz_x')),'contest refusal: 24 h wording, unknown → generic French');
  ok(card.includes('contestRefusalLabel(res.reason)')&&!/Alert\.alert\([^)]*,\s*res\.reason\)/.test(card)&&!/:\s*res\.reason,/.test(card),'static: no raw code in contest alert');
  ok(!/perdue sans suite/.test(ctx)&&!/perdue sans suite/.test(od)&&/puis perdue sans contestation \(6,90/.test(ctx)&&od.includes('puis perdue sans contestation : 6,90'),'host alert / toast / chat note: « puis perdue sans contestation »');
  const lossIdx=ctx.indexOf('const lossText');
  ok(lossIdx>0&&/text: banned[\s\S]{0,400}lossText/.test(ctx)&&/body: banned[\s\S]{0,600}lossText/.test(ctx),'static: chat note and toast share the same wording');
}

// B1 / B2 (go Paolo 17/10) : absence comptée seulement quand définitive ; contestation acceptée = absence effacée
{
  const NC=require('../src/utils/noShowContest');
  const DH=require('../src/utils/depositH6');
  const LT=require('../src/utils/leaveTable');
  const TR=require('../src/utils/tableReports');
  const RE=require('../src/utils/reviewEligibility');
  const MIN=60e3, T=now-2*H, NSAT=T+H, DL=NSAT+24*H;
  const guest:any={...me,guestNoShowCount:0};
  const st=(x:any={},more:any={})=>S({currentUser:host,outings:[o({startsAt:iso(T),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})],...more,...x});
  const NS=(s0:any,by='h1',strike=1,lowerPriority=false,banned=false)=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike,lowerPriority,banned,reportedAt:iso(NSAT),reportedByUserId:by}});
  const CT=(s0:any,at=NSAT+H)=>D({...s0,currentUser:guest},{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'Phrase privée zq7 : j’étais là.',at:iso(at)}});
  const EXP=(s0:any,at=DL)=>D(s0,{type:'EXPIRE_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(at)}});
  const CONF=(s0:any)=>D(s0,{type:'CONFIRM_NO_SHOW_AFTER_REVIEW',payload:{requestId:'r1',at:iso(DL+H)}});
  const ACC=(s0:any)=>D(s0,{type:'ACCEPT_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(DL+H)}});
  const HNS=(s0:any)=>((ST:any)=>ST.outings[0].hostNoShowCase?D(ST,{type:'EXPIRE_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso((x=>x?Date.parse(x.reportedAt)+24*H:0)(ST.outings[0].hostNoShowCase))}}):ST)(D(D(s0,{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false}}),{type:'RETURN_DEPOSITS_FOR_OUTING',payload:{outingId:'o1',reason:'host_no_show'}}));
  const asGuest=(s0:any)=>({...s0,currentUser:guest});
  // déclaration seule : ni strike ni sanction, même si le payload en porte
  const d0=NS(asGuest(st()),'h1',3,true,true);
  ok(!d0.guestNoShowStrikes.u1&&!d0.currentUser.banned&&!d0.currentUser.lowerPriority&&!d0.currentUser.profileMention&&(d0.currentUser.guestNoShowCount??0)===0&&d0.requests[0].depositStatus==='noshow_pending','declaration alone: no strike, no priority, no warning, no ban');
  // expiration 24 h : strike + perte
  const e=EXP(d0);
  ok(e.requests[0].depositStatus==='forfeited'&&e.guestNoShowStrikes.u1===1&&e.currentUser.guestNoShowCount===1,'24 h expiry: strike and loss');
  ok(EXP(d0,DL-MIN).guestNoShowStrikes.u1===undefined,'no strike at 24 h − 1 min');
  ok(JSON.stringify(EXP(e,DL+H).guestNoShowStrikes)===JSON.stringify(e.guestNoShowStrikes),'expiry idempotent: counted once');
  // revue confirmée : strike + perte
  const c=CT(d0), cf=CONF(c);
  ok(!c.guestNoShowStrikes.u1,'contested: no strike during review');
  ok(cf.requests[0].depositStatus==='forfeited'&&cf.guestNoShowStrikes.u1===1,'review confirmed: strike and loss');
  // 3e absence en attente : pas de ban ; ban seulement après finalisation
  const two=asGuest(st({guestNoShowStrikes:{u1:2}}));
  const p3=NS(two,'h1',3,true,true);
  ok(!p3.currentUser.banned&&p3.guestNoShowStrikes.u1===2,'3rd absence pending: no ban');
  ok(!CT(p3).currentUser.banned,'3rd absence contested: no ban during review');
  const b3=EXP(p3), b3r=CONF(CT(p3));
  ok(b3.currentUser.banned===true&&b3.guestNoShowStrikes.u1===3&&b3r.currentUser.banned===true,'ban only after finalisation (expiry or confirmed review)');
  ok(EXP(NS(asGuest(st({guestNoShowStrikes:{u1:1}})))).currentUser.lowerPriority===true,'2nd absence: lower priority applied at finalisation');
  // contestation acceptée : absence effacée
  const a=ACC(CT(p3));
  const ra=a.requests[0];
  ok(ra.attendance===undefined&&ra.depositStatus==='returned'&&ra.noShowNotRetained===true,'contest accepted: attendance cleared, deposit returned');
  ok(a.guestNoShowStrikes.u1===2&&!a.currentUser.banned&&!a.currentUser.lowerPriority&&(a.currentUser.guestNoShowCount??0)===0,'contest accepted: no strike, no warning, no ban');
  const a1=ACC(CT(d0));
  ok(!a1.guestNoShowStrikes.u1&&!a1.currentUser.profileMention,'contest accepted (1st): nothing counted');
  ok(TR.canOpenTableReport({...a1.outings[0],startsAt:iso(T)},a1.requests,'u1',now)&&!TR.isMarkedNoShow(a1.outings[0],a1.requests,'u1'),'contest accepted: guest can report again');
  const done={...a1.outings[0],status:'completed'};
  ok(RE.reviewEligibility({fromUserId:'u1',toUserId:'h1',outing:done,requests:a1.requests,reviews:[]}).ok===true&&a1.requests[0].attendance===undefined,'contest accepted: counts as presence for rating (A), attendance untouched');
  ok(D(a1,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(NSAT+2*H),reportedByUserId:'h1'}}).requests[0].depositStatus==='returned','contest accepted: no second « Pas venu »');
  const hp=LT.projectRequestForHost(ra);
  ok(DH.hostReturnedDepositLine(hp,a.outings[0])==='Moi · absence non retenue'&&DH.hostReturnedDepositLine(hp,{...a.outings[0],startsAt:iso(now+H)})==='Moi · absence non retenue','host sees « X · absence non retenue »');
  ok(!/zq7|j’étais|noShowContest|contest_accepted|contested/.test(JSON.stringify(hp)),'host: no sentence, no detail');
  ok(NC.hostNoShowShareEuros(ra)===0&&NC.hostNoShowShareEuros(c.requests[0])===0&&NC.hostNoShowShareEuros(d0.requests[0])===0,'host share 0 € if not retained or pending');
  ok(NC.hostNoShowShareEuros(e.requests[0])===13.1&&NC.hostNoShowShareEuros(cf.requests[0])===13.1,'host share 13,10 € only when finally lost');
  ok(LT.hostDepositStatus(d0.requests[0])==='noshow_pending'&&LT.hostDepositStatus(c.requests[0])==='noshow_pending','waiting: host still sees « caution en attente »');
  // hôte déclaré absent pendant l’attente ou la revue
  const hw=HNS(d0), hr=HNS(c);
  ok(hw.requests[0].depositStatus==='returned'&&!hw.guestNoShowStrikes.u1&&EXP(hw).requests[0].depositStatus==='returned'&&!EXP(hw).guestNoShowStrikes.u1,'host absent during the 24 h: returned, never counted');
  ok(hr.requests[0].depositStatus==='returned'&&!CONF(hr).guestNoShowStrikes.u1&&CONF(hr).requests[0].depositStatus==='returned','host absent during review: returned, never counted');
  const hf=HNS(e);
  ok(hf.requests[0].depositStatus==='returned'&&hf.requests[0].attendance===undefined&&hf.guestNoShowStrikes.u1===0,'already finally lost, then host absent: returned, absence removed (B)');
  // auto-déclaration : perte et comptage immédiats
  const self=NS(asGuest(st()),'u1',1);
  ok(self.requests[0].depositStatus==='forfeited'&&self.guestNoShowStrikes.u1===1&&self.currentUser.guestNoShowCount===1,'self-declared: immediate loss and count (unchanged)');
  const self3=NS(two,'u1',3,true,true);
  ok(self3.currentUser.banned===true,'self-declared 3rd: immediate ban (unchanged)');
  // confidentialité de la phrase
  ok([d0,c,cf,a,hr].every((x:any)=>!/zq7/.test(JSON.stringify(x.requests.map(LT.projectRequestForHost)))),'contest sentence never in host projection (all stages)');
  ok(c.requests[0].noShowContest.note.includes('zq7'),'sentence kept internally for review');
  // statique : bouton masqué après absence non retenue, callback sans comptage à la déclaration
  const fs=require('node:fs'), path=require('node:path');
  const rd=(f:string)=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8');
  const od=rd('screens/OutingDetailScreen.tsx'), ctx=rd('data/ChanceContext.tsx');
  const bi=od.indexOf('title={`Signaler absence de ${r.userName}`}');
  ok(od.slice(bi-500,bi).includes('!r.noShowNotRetained'),'static: « Signaler absence » hidden after « absence non retenue »');
  ok(/const strike = pending \? prev : prev \+ 1;/.test(ctx),'static: callback does not count at a pending declaration');
}

// ligne hôte « X · caution rendue » : à partir de H+6 ou si l’hôte est déclaré « Pas venu » ; rien avant H+6 (joker invisible)
{
  const DH=require('../src/utils/depositH6');
  const LT=require('../src/utils/leaveTable');
  const MIN=60e3;
  const imp=(x:any={})=>({id:'i1',outingId:'o1',requestId:'r1',reporterId:'u1',reporterName:'Moi',responderIds:['h1'],motive:'autre',reason:'x',status:'pending',createdAt:iso(now-2*H),...x});
  const T=now+2*H; // moment à venir : imprévu refusé + joker avant H
  const s0=S({currentUser:me,outings:[o({startsAt:iso(T),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})],imprevuReports:[imp({status:'refused',respondedAt:iso(now-H),respondedByUserId:'h1'})]});
  // état joker : caution rendue, aucune présence ni départ, pas de cause H+6
  const j=D(s0,{type:'USE_JOKER_ON_IMPREVU',payload:{imprevuId:'i1',requestId:'r1',monthKey:'2026-10',usedAt:iso(now)}});
  ok(j.imprevuReports[0].jokerUsed===true,'setup: joker used on refused imprévu (real action)');
  const jr=j.requests[0];
  const jo={...s0.outings[0]};
  ok(jr.depositStatus==='returned'&&!jr.attendance&&!jr.leftTableAt&&!jr.depositReturnCause,'setup: joker-returned deposit, no presence / leave / H+6 cause');
  ok(DH.hostReturnedDepositLine(LT.projectRequestForHost(jr),jo,now)===null,'joker (imprévu refused) before H: no host line');
  ok(DH.hostReturnedDepositLine(jr,jo,T+6*H-MIN)===null,'joker: no host line at H+6 − 1 min');
  ok(DH.hostReturnedDepositLine(jr,jo,T+6*H)==='Moi · caution rendue 6 h après le début','at H+6: joker shows the silence label (C)');
  ok(DH.hostReturnedDepositLine({...jr,depositReturnCause:'h6'},jo,T+6*H)==='Moi · caution rendue 6 h après le début','H+6 cause line unchanged');
  ok(DH.hostReturnedDepositLine(jr,{...jo,hostNoShowReported:true},now)==='Moi · caution rendue','host declared « Pas venu » before H+6: line shown');
  ok(DH.hostReturnedDepositLine({...jr,noShowNotRetained:true},jo,now)==='Moi · absence non retenue','« absence non retenue » unaffected');
  ok(DH.hostReturnedDepositLine(jr,{...jo,isPartnerListing:true},T+7*H)===null,'partner listing: never the neutral line from H+6 rule');
  ok([{attendance:'present'},{attendance:'absent'},{leftTableAt:iso(now)},{depositStatus:'noshow_pending'},{depositStatus:'held'}].every((x:any)=>DH.hostReturnedDepositLine({...jr,...x},jo,T+7*H)===null),'presence / absence / leave / pending / held: no returned line (their own lines unchanged)');
  // malaise vs départ simple : vue hôte identique, avant et après H+6
  const sl=S({currentUser:me,outings:[o({startsAt:iso(now-10*MIN),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})]});
  const L=(reason?:any)=>D(sl,{type:'LEAVE_TABLE',payload:{requestId:'r1',leftAt:iso(now),reason,reportId:'lv'}});
  const a=L(), b=L('discomfort');
  const view=(x:any,at:number)=>JSON.stringify({p:LT.projectRequestForHost(x.requests[0]),line:DH.hostReturnedDepositLine(LT.projectRequestForHost(x.requests[0]),x.outings[0],at),leave:LT.hostLeaveView(x.requests[0])});
  ok(view(a,now)===view(b,now)&&view(a,now+7*H)===view(b,now+7*H),'host view identical with / without malaise (before and after H+6)');
  const fs=require('node:fs'), path=require('node:path');
  const od=fs.readFileSync(path.join(__dirname,'..','src','screens','OutingDetailScreen.tsx'),'utf8');
  ok((od.match(/hostReturnedDepositLine\(r, outing\)/g)||[]).length===2,'static: screen passes the outing (H+6 / host no-show gate)');
}

// correction : le joker passe avant la contestation dans REPORT_GUEST_NO_SHOW
{
  const T=now+2*H;
  const imp={id:'i1',outingId:'o1',requestId:'r1',reporterId:'u1',reporterName:'Moi',responderIds:['h1'],motive:'autre',reason:'x',status:'refused',respondedAt:iso(now-H),respondedByUserId:'h1',createdAt:iso(now-2*H)};
  const s0=S({currentUser:me,outings:[o({startsAt:iso(T),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})],imprevuReports:[imp]});
  const j=D(s0,{type:'USE_JOKER_ON_IMPREVU',payload:{imprevuId:'i1',requestId:'r1',monthKey:'2026-10',usedAt:iso(now)}});
  ok(j.imprevuReports[0].jokerUsed===true&&j.requests[0].depositStatus==='returned','setup: joker active');
  const ns=D({...j,currentUser:host},{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(T+H),reportedByUserId:'h1'}});
  const r=ns.requests[0];
  ok(r.depositStatus==='returned'&&r.attendance!=='absent'&&!r.noShowReportedAt&&!r.noShowContest&&!ns.guestNoShowStrikes.u1,'joker active: host « Pas venu » with author refused, no contest created');
  const fs=require('node:fs'), path=require('node:path');
  const ctx=fs.readFileSync(path.join(__dirname,'..','src','data','ChanceContext.tsx'),'utf8');
  const c=ctx.indexOf("case 'REPORT_GUEST_NO_SHOW'");
  const body=ctx.slice(c,ctx.indexOf("case 'REPORT_HOST_NEVER_HONOR'",c));
  ok(body.indexOf('isJokerExempted(')>0&&body.indexOf('isJokerExempted(')<body.indexOf('noShowOpensContest(outingNoShow'),'static: joker checked before the contest branch');
}

// hôte déclaré absent (H+6, contestation par l’invité « Pas venu », règle B), A (note), C (joker invisible), message d’absence retenue
{
  const NC=require('../src/utils/noShowContest');
  const DH=require('../src/utils/depositH6');
  const LT=require('../src/utils/leaveTable');
  const TR=require('../src/utils/tableReports');
  const RE=require('../src/utils/reviewEligibility');
  const RL=require('../src/utils/refusalLabels');
  const MIN=60e3, T=now-2*H, NSAT=T+H, DL=NSAT+24*H;
  const guest:any={...me};
  const g2=rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'});
  const st=(more:any={},ox:any={})=>S({currentUser:host,outings:[o({startsAt:iso(T),status:'closed',...ox})],requests:[rq({status:'confirmed',depositStatus:'held'}),g2],...more});
  const NS=(s0:any,by='h1',at=NSAT)=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(at),reportedByUserId:by}});
  const HN=(s0:any,at:number,by?:string)=>D(s0,{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false,reportedAt:iso(at),reportedByUserId:by}});
  const RET=(s0:any)=>((ST:any)=>ST.outings[0].hostNoShowCase?D(ST,{type:'EXPIRE_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso((x=>x?Date.parse(x.reportedAt)+24*H:0)(ST.outings[0].hostNoShowCase))}}):ST)(s0); // absence hôte retenue (24 h sans contestation de l’hôte)
  const EXP=(s0:any,at=DL)=>D(s0,{type:'EXPIRE_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(at)}});
  const CONF=(s0:any)=>D(s0,{type:'CONFIRM_NO_SHOW_AFTER_REVIEW',payload:{requestId:'r1',at:iso(DL+H)}});
  const ACC=(s0:any)=>D(s0,{type:'ACCEPT_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(DL+H)}});
  // 1) hôte « Pas venu » : strictement avant H+6 (table normale), partenaires non concernés
  ok(HN(st(),T+6*H-MIN).outings[0].hostNoShowReported===true,'host « Pas venu » accepted at H+6 − 1 min');
  ok(!HN(st(),T+6*H).outings[0].hostNoShowReported&&!HN(st(),T+6*H).hostNoShowStrikes.h1,'host « Pas venu » refused at H+6 (reducer)');
  ok(HN(st({},{isPartnerListing:true}),T+30*H).outings[0].hostNoShowReported===true,'partner: no H+6 bound on host « Pas venu » (unchanged)');
  ok(RL.refusalLabel('too_late','host_noshow').includes('6 h')&&!/_/.test(RL.refusalLabel('too_late','host_noshow')),'too_late (host) in clear French');
  // 2) invité « Pas venu » qui déclare l’hôte absent pendant ses 24 h = contestation en revue
  const p0=NS(st());
  const hc=HN({...p0,currentUser:guest},NSAT+30*MIN,'u1');
  const r1=hc.requests[0];
  ok(hc.outings[0].hostNoShowReported===true&&r1.depositStatus==='contested'&&r1.noShowContest.viaHostNoShow===true,'« Pas venu » guest declares host absent: own deposit goes to review');
  ok(r1.depositStatus!=='returned'&&!hc.guestNoShowStrikes.u1,'no automatic return, nothing counted before review');
  ok(hc.requests[1].depositStatus==='held'&&RET(hc).requests[1].depositStatus==='returned','other (unmarked) guest: pending during the host window, then returned');
  ok(EXP(hc,DL).requests[0].depositStatus==='contested'&&D(hc,{type:'RETURN_DEPOSITS_H6',payload:{outingId:'o1',at:iso(T+7*H)}}).requests[0].depositStatus==='contested','under review: neither 24 h expiry nor H+6 settles it');
  const ha=RET(hc), hf=D(D({...hc,currentUser:host},{type:'CONTEST_HOST_NO_SHOW',payload:{outingId:'o1',note:'J’y étais',at:iso(NSAT+H)}}),{type:'ACCEPT_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso(NSAT+2*H)}});
  ok(ha.requests[0].depositStatus==='returned'&&ha.requests[0].attendance===undefined&&ha.requests[0].noShowVoided===true&&!ha.guestNoShowStrikes.u1,'decision 4: host retained absent → declarer returned, « Pas venu » erased (B)');
  ok(hf.requests[0].depositStatus==='forfeited'&&hf.guestNoShowStrikes.u1===1&&ACC(hc).requests[0].depositStatus==='contested'&&CONF(hc).requests[0].depositStatus==='contested','decision 4: host present (contest accepted) → declarer lost and counted; no independent review');
  ok(DH.hostReturnedDepositLine(LT.projectRequestForHost(ha.requests[0]),ha.outings[0])==='Moi · caution rendue','host view after B: « caution rendue », no « absence signalée »');
  // hors délai / caution définitive : refus
  const late={...p0,requests:p0.requests.map((r:any)=>r.id==='r1'?{...r,noShowReportedAt:iso(NSAT-30*H)}:r)};
  ok(!NC.canNoShowGuestDeclareHostAbsent(late.requests[0],NSAT)&&!HN({...late,currentUser:guest},NSAT,'u1').outings[0].hostNoShowReported,'outside 24 h: guest cannot declare host absent');
  const def=CONF(D({...p0,currentUser:guest},{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'x',at:iso(NSAT+MIN)}}));
  ok(def.requests[0].depositStatus==='forfeited'&&!HN({...def,currentUser:guest},NSAT+2*H,'u1').outings[0].hostNoShowReported,'definitive deposit: guest cannot declare host absent');
  const selfAbs=NS(st({currentUser:guest}),'u1');
  ok(!HN(selfAbs,NSAT+MIN,'u1').outings[0].hostNoShowReported,'self-declared absent guest: cannot declare host absent');
  ok(RL.refusalLabel('noshow_window_closed','host_noshow').includes('24 h'),'noshow_window_closed label');
  // autre invité qui déclare l’hôte absent pendant les 24 h : règle B directe
  const other=RET(HN({...p0,currentUser:{id:'u2',firstName:'Bea'}},NSAT+MIN,'u2'));
  ok(other.requests[0].depositStatus==='returned'&&other.requests[0].attendance===undefined&&other.requests[0].noShowVoided===true&&!other.guestNoShowStrikes.u1,'other guest declares host absent: B applied to the « Pas venu » guest');
  // B : caution déjà perdue → rendue, absence décomptée, fermeture annulée (si causée par elle) ; auto-déclaration exclue
  const two={...st({guestNoShowStrikes:{u1:2}}),currentUser:guest};
  const lost3=EXP(NS(two));
  ok(lost3.requests[0].depositStatus==='forfeited'&&lost3.guestNoShowStrikes.u1===3&&lost3.currentUser.banned===true&&lost3.requests[0].noShowCausedBan===true,'setup: 3rd absence finalised → ban caused by it');
  const unb=RET(HN(lost3,NSAT+2*H,'u2'));
  ok(unb.requests[0].depositStatus==='returned'&&unb.requests[0].attendance===undefined&&unb.guestNoShowStrikes.u1===2&&unb.currentUser.banned===false&&unb.currentUser.guestNoShowCount===2,'B on finally lost: returned, absence removed, ban lifted');
  const preBan={...st({guestNoShowStrikes:{u1:3}}),currentUser:{...guest,banned:true,bannedReason:'autre'}};
  const lost4=EXP(NS(preBan));
  const kb=RET(HN(lost4,NSAT+2*H,'u2'));
  ok(!lost4.requests[0].noShowCausedBan&&kb.currentUser.banned===true&&kb.guestNoShowStrikes.u1===3,'ban not caused by this absence: kept');
  const selfL=RET(HN(NS({...st(),currentUser:guest},'u1'),NSAT+MIN,'u2'));
  ok(selfL.requests[0].depositStatus==='forfeited'&&selfL.requests[0].attendance==='absent'&&selfL.guestNoShowStrikes.u1===1,'B exception: self-declared absence stays lost');
  ok(TR.canOpenTableReport(unb.outings[0],unb.requests,'u1',now),'B: guest can report again');
  // A : contestation acceptée vaut présence pour la note (moment terminé), attendance réelle inchangée
  const acc=ACC(D({...p0,currentUser:guest},{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'j’y étais',at:iso(NSAT+MIN)}}));
  const done={...acc.outings[0],status:'completed'};
  ok(acc.requests[0].attendance===undefined&&RE.reviewEligibility({fromUserId:'u1',toUserId:'h1',outing:done,requests:acc.requests,reviews:[]}).ok===true,'A: accepted contest counts as presence for rating');
  ok(RE.reviewEligibility({fromUserId:'u1',toUserId:'h1',outing:{...acc.outings[0],status:'open'},requests:acc.requests,reviews:[]}).reason==='not_completed','A: other conditions still required (moment not over)');
  ok(RE.reviewEligibility({fromUserId:'u1',toUserId:'h1',outing:done,requests:p0.requests,reviews:[]}).reason==='not_participant','pending « Pas venu »: cannot rate');
  ok(NS(acc,'h1',NSAT+2*H).requests[0].depositStatus==='returned','accepted: new « Pas venu » still refused (kept)');
  // 3) message « Ton absence est retenue. La caution est perdue. » : une fois, à l’invité seulement
  const eg=EXP({...p0,currentUser:guest});
  ok(eg.toast?.body===NC.NOSHOW_FINAL_NOTICE_TEXT&&eg.requests[0].noShowFinalNotice.text==='Ton absence est retenue. La caution est perdue.','expiry: guest receives the message');
  const eh=EXP(p0);
  ok(eh.toast?.body!==NC.NOSHOW_FINAL_NOTICE_TEXT&&eh.requests[0].noShowFinalNotice.text===NC.NOSHOW_FINAL_NOTICE_TEXT,'expiry on host device: no banner for the host, notice kept for the guest');
  ok(!/absence est retenue/.test(JSON.stringify(eh.requests.map(LT.projectRequestForHost)))&&!/noShowFinalNotice|noShowStrikeApplied|noShowCausedBan/.test(JSON.stringify(eh.requests.map(LT.projectRequestForHost))),'message and sanctions invisible in host projection');
  const cg=CONF(D({...p0,currentUser:guest},{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'x',at:iso(NSAT+MIN)}}));
  ok(cg.toast?.body===NC.NOSHOW_FINAL_NOTICE_TEXT&&cg.requests[0].noShowFinalNotice,'review confirmed: guest receives the message');
  const again=EXP({...eg,toast:null},DL+H);
  ok(again.toast===null&&JSON.stringify(again.requests)===JSON.stringify(eg.requests),'message sent once (no repeat)');
  // C : joker invisible — même vue hôte que le silence après H+6, refus neutre
  const imp={id:'i1',outingId:'o1',requestId:'r1',reporterId:'u1',reporterName:'Moi',responderIds:['h1'],motive:'autre',reason:'x',status:'refused',respondedAt:iso(now-H),respondedByUserId:'h1',createdAt:iso(now-2*H)};
  const TJ=now+H;
  const js=D(S({currentUser:me,outings:[o({startsAt:iso(TJ),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})],imprevuReports:[imp]}),{type:'USE_JOKER_ON_IMPREVU',payload:{imprevuId:'i1',requestId:'r1',monthKey:'2026-10',usedAt:iso(now)}});
  const sil=D(S({currentUser:me,outings:[o({startsAt:iso(TJ),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'})]}),{type:'RETURN_DEPOSITS_H6',payload:{outingId:'o1',at:iso(TJ+6*H)}});
  const hv=(x:any,at:number)=>JSON.stringify({p:LT.projectRequestForHost(x.requests[0]),line:DH.hostReturnedDepositLine(x.requests[0],x.outings[0],at),o:x.outings[0]});
  ok(js.requests[0].depositStatus==='returned'&&sil.requests[0].depositStatus==='returned'&&hv(js,TJ+6*H)===hv(sil,TJ+6*H),'C: host view identical joker vs silence after H+6');
  ok(DH.hostReturnedDepositLine(js.requests[0],js.outings[0],TJ+6*H)==='Moi · caution rendue 6 h après le début'&&DH.hostReturnedDepositLine(js.requests[0],js.outings[0],TJ+6*H-MIN)===null,'C: joker line from H+6, nothing before');
  ok(!/joker/i.test(hv(js,TJ+6*H))&&!/joker/i.test(hv(js,now)),'C: no « joker » in host view');
  ok(RL.refusalLabel('not_declarable')==='Cette absence ne peut pas être déclarée.'&&!/joker/i.test(RL.refusalLabel('not_declarable')),'C: neutral refusal label');
  const fs=require('node:fs'), path=require('node:path');
  const ctx=fs.readFileSync(path.join(__dirname,'..','src','data','ChanceContext.tsx'),'utf8');
  const cb=ctx.slice(ctx.indexOf('const reportGuestNoShow = useCallback('),ctx.indexOf('const reportGuestNoShow = useCallback(')+5000);
  const jb=cb.slice(cb.indexOf('if (!shouldApplyGuestNoShowPenalty(jokerExempted))'),cb.indexOf('if (!shouldApplyGuestNoShowPenalty(jokerExempted))')+300);
  ok(/reason: 'not_declarable'/.test(jb)&&!/Joker/.test(jb)&&!/dispatch/.test(jb),'C: joker refusal neutral, nothing sent, no toast');
}

// délai maximum de revue : 7 jours après l’entrée en revue → caution rendue, absence non retenue
{
  const NC=require('../src/utils/noShowContest');
  const LT=require('../src/utils/leaveTable');
  const DH=require('../src/utils/depositH6');
  const MIN=60e3, D7=7*24*H, T=now-2*H, NSAT=T+H, CAT=NSAT+3*H;
  const guest:any={...me};
  const st=()=>S({currentUser:guest,outings:[o({startsAt:iso(T),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})]});
  const NS=(s0:any)=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(NSAT),reportedByUserId:'h1'}});
  const c=D(NS(st()),{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'Phrase zq8',at:iso(CAT)}});
  const ER=(s0:any,at:number)=>D(s0,{type:'EXPIRE_NO_SHOW_REVIEW',payload:{requestId:'r1',at:iso(at)}});
  ok(NC.NOSHOW_REVIEW_MAX_MS===D7,'review max: named constant = 7 days');
  ok(ER(c,CAT+D7-MIN).requests[0].depositStatus==='contested','review timeout refused at 7 d − 1 min');
  const e=ER(c,CAT+D7);
  ok(e.requests[0].depositStatus==='returned'&&e.requests[0].attendance===undefined&&e.requests[0].noShowNotRetained===true&&e.requests[0].noShowContest.outcome==='review_expired','7 d without decision: returned, absence not retained');
  ok(!e.guestNoShowStrikes.u1&&!e.toast,'7 d timeout: nothing counted, no « absence retenue » message');
  ok(JSON.stringify(ER(e,CAT+D7+H))===JSON.stringify(e),'review timeout idempotent');
  ok(D(e,{type:'CONFIRM_NO_SHOW_AFTER_REVIEW',payload:{requestId:'r1',at:iso(CAT+D7+H)}}).requests[0].depositStatus==='returned','late review after timeout: no effect');
  ok(D(c,{type:'CONFIRM_NO_SHOW_AFTER_REVIEW',payload:{requestId:'r1',at:iso(CAT+D7)}}).requests[0].depositStatus==='contested','review at 7 d (unprocessed timeout): refused, timeout wins');
  ok(D(c,{type:'CONFIRM_NO_SHOW_AFTER_REVIEW',payload:{requestId:'r1',at:iso(CAT+D7-MIN)}}).requests[0].depositStatus==='forfeited','review at 7 d − 1 min: still possible');
  ok(NC.reviewDeadlineMs(c.requests[0])===CAT+D7,'7 days counted from the contest (entry into review)');
  ok(JSON.stringify(NC.requestsDueForReviewTimeout(c.requests,CAT+D7))==='["r1"]'&&NC.requestsDueForReviewTimeout(c.requests,CAT+D7-MIN).length===0,'timer helper: due at 7 d only');
  ok(DH.hostReturnedDepositLine(LT.projectRequestForHost(e.requests[0]),e.outings[0])==='Moi · absence non retenue'&&!/zq8/.test(JSON.stringify(e.requests.map(LT.projectRequestForHost))),'host: « absence non retenue », sentence never visible');
  // contestation via « hôte absent » : 7 jours aussi, règle B
  const hc=D(D(NS(st()),{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false,reportedAt:iso(CAT),reportedByUserId:'u1'}}),{type:'RETURN_DEPOSITS_FOR_OUTING',payload:{outingId:'o1',reason:'host_no_show'}});
  ok(ER(hc,CAT+D7).requests[0].depositStatus==='contested'&&NC.requestsDueForReviewTimeout(hc.requests,CAT+D7).length===0,'host-absent contest: no independent 7 d timeout (decided with the host)');
  const fs=require('node:fs'), path=require('node:path');
  const ctx=fs.readFileSync(path.join(__dirname,'..','src','data','ChanceContext.tsx'),'utf8');
  const card=fs.readFileSync(path.join(__dirname,'..','src','components','NoShowContestCard.tsx'),'utf8');
  ok(/requestsDueForReviewTimeout\(state\.requests, now\)[\s\S]{0,300}EXPIRE_NO_SHOW_REVIEW[\s\S]{0,400}setInterval\(tick, 60_000\)/.test(ctx),'static: local timer for the 7-day review timeout');
  ok(card.includes('sans décision sous 7 jours, elle t’est rendue'),'guest card mentions the 7-day limit');
}

// contestation par l’hôte de son « absent » (table normale)
{
  const HC=require('../src/utils/hostNoShowContest');
  const LT=require('../src/utils/leaveTable');
  const TR=require('../src/utils/tableReports');
  const MIN=60e3, D1=24*H, D7=7*24*H, T=now-2*H, NSAT=T+H, HAT=T+2*H, CT=HAT+2*H;
  const guest:any={...me};
  const st=(more:any={})=>S({currentUser:guest,outings:[o({startsAt:iso(T),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'}),rq({id:'r3',userId:'u3',userName:'Cy',status:'confirmed',depositStatus:'held'})],...more});
  const NS3=(s0:any)=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r3',guestId:'u3',strike:1,lowerPriority:false,reportedAt:iso(NSAT),reportedByUserId:'h1'}});
  const HN=(s0:any)=>D(s0,{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false,reportedAt:iso(HAT),reportedByUserId:'u1'}});
  const asHost=(s0:any)=>({...s0,currentUser:{...host}});
  const CH=(s0:any,at:number,note='J’étais au bar zq9')=>D(asHost(s0),{type:'CONTEST_HOST_NO_SHOW',payload:{outingId:'o1',note,at:iso(at)}});
  const EXPH=(s0:any,at:number)=>D(s0,{type:'EXPIRE_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso(at)}});
  const CONFH=(s0:any,at:number)=>D(s0,{type:'CONFIRM_HOST_NO_SHOW_AFTER_REVIEW',payload:{outingId:'o1',at:iso(at)}});
  const ACCH=(s0:any,at:number)=>D(s0,{type:'ACCEPT_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso(at)}});
  const REVH=(s0:any,at:number)=>D(s0,{type:'EXPIRE_HOST_NO_SHOW_REVIEW',payload:{outingId:'o1',at:iso(at)}});
  const p=HN(NS3(st()));
  const dep=(x:any)=>x.requests.map((r:any)=>r.depositStatus).join(',');
  ok(p.outings[0].hostNoShowCase.status==='pending'&&p.outings[0].hostNoShowReported===true&&!p.hostNoShowStrikes.h1,'host absent declared: 24 h window, host sanction pending');
  ok(dep(p)==='held,held,noshow_pending','declaration: guest deposits pending (no immediate return), « Pas venu » untouched');
  ok(dep(D(p,{type:'RETURN_DEPOSITS_H6',payload:{outingId:'o1',at:iso(T+7*H)}}))==='held,held,noshow_pending','window: H+6 return suspended');
  ok(!TR.canOpenTableReport(p.outings[0],p.requests,'h1',HAT+MIN),'host declared absent still cannot report (window)');
  // 24 h : seuils
  ok(CH(p,HAT+D1-MIN).outings[0].hostNoShowCase.status==='contested','host contest at 24 h − 1 min: accepted');
  ok(CH(p,HAT+D1).outings[0].hostNoShowCase.status==='pending'&&HC.hostContestRefusal(p.outings[0],'h1','x',HAT+D1)==='too_late','host contest at 24 h: refused');
  ok(HC.hostContestRefusal(p.outings[0],'h1','   ',CT)==='note_required'&&CH(p,CT,'  ').outings[0].hostNoShowCase.status==='pending','sentence mandatory');
  ok(HC.hostContestRefusal(p.outings[0],'u2','x',CT)==='not_host'&&D(p,{type:'CONTEST_HOST_NO_SHOW',payload:{outingId:'o1',note:'x',at:iso(CT)}}).outings[0].hostNoShowCase.status==='pending','only the host can contest');
  ok(EXPH(p,HAT+D1-MIN)===p||EXPH(p,HAT+D1-MIN).outings[0].hostNoShowCase.status==='pending','expiry refused at 24 h − 1 min');
  // pas de contestation → retenue : sanction hôte, règle B, cautions rendues
  const ret=EXPH(p,HAT+D1);
  ok(ret.outings[0].hostNoShowCase.status==='retained'&&ret.hostNoShowStrikes.h1===1,'no contest at 24 h: absence retained, host strike');
  ok(dep(ret)==='returned,returned,returned'&&ret.requests[2].attendance===undefined&&ret.requests[2].noShowVoided===true,'retained: guests returned (B for the « Pas venu » guest)');
  // contestation → revue
  const c=CH(p,CT);
  ok(dep(c)==='held,held,noshow_pending'&&!c.hostNoShowStrikes.h1&&dep(D(c,{type:'RETURN_DEPOSITS_H6',payload:{outingId:'o1',at:iso(T+7*H)}}))==='held,held,noshow_pending','review: deposits and host sanction still pending');
  ok(!TR.canOpenTableReport(c.outings[0],c.requests,'h1',CT+MIN),'host declared absent still cannot report (review)');
  ok(EXPH(c,HAT+D1).outings[0].hostNoShowCase.status==='contested','contested: 24 h expiry no longer applies');
  ok(CH(c,CT+MIN).hostNoShowContestNotes.o1==='J’étais au bar zq9','second contest: ignored');
  const rj=CONFH(c,CT+D7-MIN);
  ok(rj.outings[0].hostNoShowCase.status==='retained'&&rj.hostNoShowStrikes.h1===1&&dep(rj)==='returned,returned,returned','contest rejected (7 d − 1 min): as before with rule B');
  const ac=ACCH(c,CT+D7-MIN);
  ok(ac.outings[0].hostNoShowReported===false&&ac.outings[0].hostNoShowCase.status==='not_retained'&&!ac.hostNoShowStrikes.h1,'contest accepted: host absence erased, no sanction');
  ok(dep(ac)==='held,held,noshow_pending'&&dep(D(ac,{type:'RETURN_DEPOSITS_H6',payload:{outingId:'o1',at:iso(CT+D7)}}))==='returned,returned,noshow_pending','accepted: guests back to normal (H+6 resumes, « Pas venu » keeps its own window)');
  ok(TR.canOpenTableReport(ac.outings[0],ac.requests,'h1',T+3*H),'accepted: host can report again (chat window permitting)');
  ok(CONFH(c,CT+D7).outings[0].hostNoShowCase.status==='contested'&&ACCH(c,CT+D7).outings[0].hostNoShowCase.status==='contested','review decision at 7 d: refused (timeout wins)');
  // revue sans décision à 7 jours
  ok(REVH(c,CT+D7-MIN).outings[0].hostNoShowCase.status==='contested','host review timeout refused at 7 d − 1 min');
  const tx=REVH(c,CT+D7);
  ok(tx.outings[0].hostNoShowCase.status==='review_expired'&&dep(tx)==='returned,returned,returned'&&tx.requests[2].attendance===undefined&&tx.requests[2].noShowVoided===true,'decision 2: 7 d without decision → guests returned, « Pas venu » erased');
  ok(tx.outings[0].hostNoShowReported===false&&!tx.hostNoShowStrikes.h1&&!tx.guestNoShowStrikes.u3&&TR.canOpenTableReport(tx.outings[0],tx.requests,'h1',T+3*H),'decision 2: nothing counted (host nor guest), host can report again');
  ok(JSON.stringify(REVH(tx,CT+D7+H))===JSON.stringify(tx)&&CONFH(tx,CT+D7+H).hostNoShowStrikes.h1===undefined,'after timeout: idempotent, no late decision');
  // minuterie
  ok(JSON.stringify(HC.outingsDueForHostContestExpiry(p.outings,HAT+D1))==='["o1"]'&&HC.outingsDueForHostContestExpiry(p.outings,HAT+D1-MIN).length===0,'timer helper: 24 h');
  ok(JSON.stringify(HC.outingsDueForHostReviewTimeout(c.outings,CT+D7))==='["o1"]'&&HC.outingsDueForHostReviewTimeout(c.outings,CT+D7-MIN).length===0,'timer helper: 7 d');
  // confidentialité de la phrase
  ok(!/zq9/.test(JSON.stringify(c.outings))&&!/zq9/.test(JSON.stringify(c.requests))&&!/zq9/.test(JSON.stringify(c.chatMessages)),'host sentence never on the outing, requests or chat (guests cannot see it)');
  ok(!/zq9/.test(JSON.stringify(c.requests.map(LT.projectRequestForHost))),'guest « Pas venu » contest sentence and host sentence kept apart');
  // libellés
  ok(HC.HOST_CONTEST_REFUSAL_CODES.every((k:string)=>!/_/.test(HC.hostContestRefusalLabel(k))&&HC.hostContestRefusalLabel(k)!==HC.hostContestRefusalLabel('zz')),'host contest refusals in clear French');
  // partenaire : inchangé (immédiat)
  const pp=D(S({currentUser:guest,outings:[o({startsAt:iso(T),status:'closed',isPartnerListing:true})],requests:[rq({status:'confirmed',depositStatus:'held'})]}),{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false,reportedAt:iso(HAT)}});
  ok(pp.outings[0].hostNoShowReported===true&&pp.outings[0].hostNoShowCase?.status==='pending'&&pp.requests[0].depositStatus==='held','decision 6: partner « lieu absent » → 24 h contest window, deposits pending');
  const fs=require('node:fs'), path=require('node:path');
  const ctx=fs.readFileSync(path.join(__dirname,'..','src','data','ChanceContext.tsx'),'utf8');
  const card=fs.readFileSync(path.join(__dirname,'..','src','components','HostNoShowContestCard.tsx'),'utf8');
  ok(/outingsDueForHostContestExpiry\(state\.outings, now\)[\s\S]{0,600}EXPIRE_HOST_NO_SHOW_REVIEW[\s\S]{0,300}setInterval\(tick, 60_000\)[\s\S]{0,200}'active'/.test(ctx),'static: local timer for host contest (interval + foreground)');
  ok(!/shadow|elevation/.test(card)&&/variant="secondary"/.test(card)&&/borderColor: colors\.border/.test(card)&&/hostContestRefusalLabel\(res\.reason\)/.test(card),'host card: Hermès (no shadow, secondary, refusalLabels)');
  ok(!/hostNoShowContestNotes/.test(card),'host card never displays the stored sentence');
}

// partenaires : même contestation que les tables normales (24 h, phrase, revue 7 jours)
{
  const NC=require('../src/utils/noShowContest');
  const LT=require('../src/utils/leaveTable');
  const PU=require('../src/utils/partners');
  const MIN=60e3, D1=24*H, D7=7*24*H, T=now-2*H, NSAT=T+H, CT=NSAT+2*H;
  const guest:any={...me};
  const st=(more:any={})=>S({currentUser:guest,outings:[o({startsAt:iso(T),status:'closed',isPartnerListing:true})],requests:[rq({status:'confirmed',depositStatus:'held'})],...more});
  const NS=(s0:any)=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(NSAT),reportedByUserId:'h1'}});
  const C=(s0:any,at:number,note='J’étais en terrasse zq7')=>D(s0,{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note,at:iso(at)}});
  const EXP=(s0:any,at:number)=>D(s0,{type:'EXPIRE_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(at)}});
  const ER=(s0:any,at:number)=>D(s0,{type:'EXPIRE_NO_SHOW_REVIEW',payload:{requestId:'r1',at:iso(at)}});
  const p=NS(st());
  ok(p.requests[0].depositStatus==='noshow_pending'&&p.requests[0].attendance==='absent'&&!p.guestNoShowStrikes.u1,'partner « Pas venu »: pending 24 h, nothing counted (no immediate loss)');
  ok(C(p,NSAT+D1-MIN).requests[0].depositStatus==='contested'&&C(p,NSAT+D1).requests[0].depositStatus==='noshow_pending','partner contest: 24 h − 1 min ok, 24 h refused');
  ok(C(p,CT,'  ').requests[0].depositStatus==='noshow_pending','partner contest: sentence mandatory');
  ok(EXP(p,NSAT+D1-MIN).requests[0].depositStatus==='noshow_pending','partner: no loss at 24 h − 1 min');
  const lost=EXP(p,NSAT+D1);
  ok(lost.requests[0].depositStatus==='forfeited'&&lost.guestNoShowStrikes.u1===1&&lost.requests[0].noShowFinalNotice.text===NC.NOSHOW_FINAL_NOTICE_TEXT,'partner: lost at 24 h without contest, absence counted, final message');
  const c=C(p,CT);
  ok(!PU.shouldAutoRefundPartnerSilence(c.outings[0],c.requests[0],T+48*H)&&!PU.shouldAutoRefundPartnerSilence(p.outings[0],p.requests[0],T+48*H)&&D(c,{type:'RETURN_DEPOSIT_SILENCE',payload:{requestId:'r1'}}).requests[0].depositStatus==='contested','« le lendemain » never settles a pending or contested partner deposit');
  ok(ER(c,CT+D7-MIN).requests[0].depositStatus==='contested','partner review: 7 d − 1 min still pending');
  const tx=ER(c,CT+D7);
  ok(tx.requests[0].depositStatus==='returned'&&tx.requests[0].noShowNotRetained===true&&!tx.guestNoShowStrikes.u1,'partner review: 7 d without decision → returned, not counted');
  const acc=D(c,{type:'ACCEPT_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(CT+H)}});
  const conf=D(c,{type:'CONFIRM_NO_SHOW_AFTER_REVIEW',payload:{requestId:'r1',at:iso(CT+H)}});
  ok(acc.requests[0].depositStatus==='returned'&&acc.requests[0].attendance===undefined&&!acc.guestNoShowStrikes.u1,'partner: contest accepted → returned, absence erased');
  ok(conf.requests[0].depositStatus==='forfeited'&&conf.guestNoShowStrikes.u1===1,'partner: contest rejected → lost and counted');
  // « Je suis arrivé » après « Pas venu » : litige comme aujourd’hui
  const arr=D(p,{type:'GUEST_ARRIVED_PARTNER',payload:{requestId:'r1',arrivedAt:iso(CT)}});
  ok(arr.requests[0].partnerDispute?.trigger==='arrival_after_absent'&&arr.requests[0].depositStatus==='contested'&&arr.requests[0].noShowContest.viaArrival===true,'decision 6: « Je suis arrivé » after « Pas venu » = contest (dispute kept)');
  // confidentialité vis-à-vis du lieu
  const hv=JSON.stringify(c.requests.map(LT.projectRequestForHost));
  ok(!/zq7|noShowContest/.test(hv)&&LT.hostDepositStatus(c.requests[0])==='noshow_pending'&&LT.hostDepositStatus(p.requests[0])==='noshow_pending','partner sees « caution en attente », never the sentence');
  // auto-déclaration : perte immédiate (inchangé)
  const self=D(st(),{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(NSAT),reportedByUserId:'u1'}});
  ok(self.requests[0].depositStatus==='forfeited','partner: self-declared absence still immediate');
  const fs=require('node:fs'), path=require('node:path');
  const scr=fs.readFileSync(path.join(__dirname,'..','src','screens','OutingDetailScreen.tsx'),'utf8');
  const card=fs.readFileSync(path.join(__dirname,'..','src','components','NoShowContestCard.tsx'),'utf8');
  ok(/la personne a 24 h pour contester/.test(scr)&&/absence signalée · caution en attente`\n/.test(scr)&&/'Le lieu' : 'L’hôte'/.test(card),'partner screens: 24 h contest wording');
}

// dernier passage contestation (Paolo, 17/10) : six décisions
{
  const NC=require('../src/utils/noShowContest');
  const PU=require('../src/utils/partners');
  const TR=require('../src/utils/tableReports');
  const MIN=60e3, D1=24*H, D7=7*24*H, T=now-2*H, NSAT=T+H;
  const guest:any={...me};
  const mk=(more:any={},ox:any={})=>S({currentUser:guest,outings:[o({startsAt:iso(T),status:'closed',...ox})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})],...more});
  const NS=(s0:any,at=NSAT,rid='r1',gid='u1')=>D(s0,{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:rid,guestId:gid,strike:1,lowerPriority:false,reportedAt:iso(at),reportedByUserId:'h1'}});
  const HN=(s0:any,at:number,by='u2')=>D(s0,{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false,reportedAt:iso(at),reportedByUserId:by}});
  const EXP=(s0:any,at:number)=>D(s0,{type:'EXPIRE_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(at)}});
  const CH=(s0:any,at:number)=>D({...s0,currentUser:{...host}},{type:'CONTEST_HOST_NO_SHOW',payload:{outingId:'o1',note:'J’étais là',at:iso(at)}});
  const back=(s0:any)=>({...s0,currentUser:s0.currentUser.id==='h1'?guest:s0.currentUser});
  const ACCH=(s0:any,at:number)=>D(s0,{type:'ACCEPT_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso(at)}});
  const REVH=(s0:any,at:number)=>D(s0,{type:'EXPIRE_HOST_NO_SHOW_REVIEW',payload:{outingId:'o1',at:iso(at)}});
  const RETH=(s0:any)=>D(s0,{type:'EXPIRE_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso(Date.parse(s0.outings[0].hostNoShowCase.reportedAt)+D1)}});
  // 1) règle B : priorité baissée et mention profil annulées
  const second=EXP(NS(mk({guestNoShowStrikes:{u1:1}},{}) ),NSAT+D1);
  ok(second.currentUser.lowerPriority===true&&second.currentUser.profileMention==='Absence après confirmation (démo)'&&second.guestNoShowStrikes.u1===2,'setup: 2nd absence → lower priority + profile mention');
  const b1=RETH(HN(second,NSAT+2*H));
  ok(b1.guestNoShowStrikes.u1===1&&b1.currentUser.lowerPriority===false&&b1.currentUser.profileMention===undefined&&b1.requests[0].depositStatus==='returned','decision 1: B lifts lower priority and profile mention');
  const third=EXP(NS(mk({guestNoShowStrikes:{u1:2}},{})),NSAT+D1);
  const b3=RETH(HN(third,NSAT+2*H));
  ok(third.currentUser.banned===true&&b3.currentUser.banned===false&&b3.guestNoShowStrikes.u1===2&&b3.currentUser.lowerPriority===false&&b3.currentUser.profileMention===undefined,'B3 (L70): B on 3rd → ban, lower priority and mention lifted even with 2 absences left');
  // 3) 24 h suspendues pendant l’absence de l’hôte
  const p=NS(mk());
  const hp=HN(p,NSAT+2*H);
  ok(hp.requests[0].noShowContestPausedAt===iso(NSAT+2*H),'decision 3: guest 24 h paused at host declaration');
  const e24=EXP(hp,NSAT+D1), e48=EXP(hp,NSAT+2*D1);
  ok(e24.requests[0].depositStatus==='noshow_pending'&&e48.requests[0].depositStatus==='noshow_pending'&&!e48.toast&&!e48.requests[0].noShowFinalNotice&&!e48.guestNoShowStrikes.u1,'decision 3: no expiry and no « absence retenue » message while host absence pending');
  ok(NC.requestsDueForContestExpiry(hp.requests,NSAT+2*D1).length===0&&NC.contestTimeLeftLabel(hp.requests[0],NSAT+3*H)===NC.contestTimeLeftLabel(hp.requests[0],NSAT+40*H),'decision 3: timer idle, time left frozen');
  ok(D(hp,{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'x',at:iso(NSAT+30*H)}}).requests[0].depositStatus==='contested','decision 3: guest can still contest during the pause');
  // contestation de l’hôte acceptée : les 24 h reprennent (22 h restantes)
  const ACC_AT=NSAT+30*H;
  const resumed=ACCH(back(CH(hp,NSAT+3*H)),ACC_AT);
  const dl=NSAT+D1+(ACC_AT-(NSAT+2*H));
  ok(!resumed.requests[0].noShowContestPausedAt&&resumed.requests[0].noShowContestPausedMs===ACC_AT-(NSAT+2*H)&&NC.contestDeadlineMs(resumed.requests[0],ACC_AT)===dl,'decision 3: host present → 24 h resume where they stopped');
  ok(EXP(resumed,dl-MIN).requests[0].depositStatus==='noshow_pending'&&EXP(resumed,dl).requests[0].depositStatus==='forfeited'&&EXP(resumed,dl).toast?.body===NC.NOSHOW_FINAL_NOTICE_TEXT,'decision 3: after resume, lost at remaining deadline (− 1 min / exact), message then');
  // revue invité « Pas venu confirmé » refusée pendant l’attente de l’hôte (choix favorable)
  const cg=HN(D(p,{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'x',at:iso(NSAT+MIN)}}),NSAT+2*H);
  ok(D(cg,{type:'CONFIRM_NO_SHOW_AFTER_REVIEW',payload:{requestId:'r1',at:iso(NSAT+3*H)}}).requests[0].depositStatus==='contested'&&D(cg,{type:'ACCEPT_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(NSAT+3*H)}}).requests[0].depositStatus==='returned','choice: no loss by guest review while host absence pending (acceptance still possible)');
  // 4) déclarant « Pas venu » : décidé par l’issue de l’hôte
  const dec=HN(p,NSAT+2*H,'u1');
  ok(dec.requests[0].depositStatus==='contested'&&dec.requests[0].noShowContest.viaHostNoShow===true,'setup: declarer under review via host absence');
  ok(RETH(dec).requests[0].depositStatus==='returned'&&RETH(dec).requests[0].noShowVoided===true,'decision 4: host retained absent → declarer returned');
  const decAcc=ACCH(back(CH(dec,NSAT+3*H)),NSAT+4*H);
  ok(decAcc.requests[0].depositStatus==='forfeited'&&decAcc.guestNoShowStrikes.u1===1&&decAcc.requests[0].noShowContest.outcome==='noshow_confirmed','decision 4: host present → declarer lost and counted');
  ok(REVH(back(CH(dec,NSAT+3*H)),NSAT+3*H+D7).requests[0].depositStatus==='returned','decision 2+4: host review undecided → declarer returned');
  const decNote=HN(D(p,{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'J’étais au comptoir',at:iso(NSAT+MIN)}}),NSAT+2*H,'u1');
  const dn=ACCH(back(CH(decNote,NSAT+3*H)),NSAT+4*H);
  ok(dn.requests[0].depositStatus==='forfeited'&&dn.guestNoShowStrikes.u1===1&&dn.requests[0].noShowContest.outcome==='noshow_confirmed','B4 (L73): host present → declarer lost even with his own sentence');
  // 2) revue non tranchée : rien retenu, invités « Pas venu » rendus et effacés, hôte libre
  const rv=REVH(back(CH(hp,NSAT+3*H)),NSAT+3*H+D7);
  ok(rv.requests[0].depositStatus==='returned'&&rv.requests[0].attendance===undefined&&!rv.guestNoShowStrikes.u1&&!rv.hostNoShowStrikes.h1&&rv.outings[0].hostNoShowReported===false,'decision 2: undecided at 7 d → nothing retained, guests returned and erased, host unblocked');
  ok(REVH(back(CH(hp,NSAT+3*H)),NSAT+3*H+D7-MIN).requests[0].depositStatus==='noshow_pending','decision 2: 7 d − 1 min: still pending');
  ok(HN(rv,NSAT+4*H).outings[0].hostNoShowCase.status==='review_expired'&&HN(ACCH(back(CH(HN(mk(),T+2*H),T+2*H+MIN)),T+3*H),T+4*H).outings[0].hostNoShowCase.status==='not_retained','no second declaration of host absence after expiry or acceptance');
  // 5) contestation de l’hôte acceptée : « Pas venu » encore possible jusqu’à H+6 (figé)
  const okH=ACCH(back(CH(HN(mk(),T+2*H),T+2*H+MIN)),T+3*H);
  ok(NS(okH,T+6*H-MIN,'r2','u2').requests[1].depositStatus==='noshow_pending','decision 5: host present again → « Pas venu » accepted at H+6 − 1 min');
  ok(NS(okH,T+6*H,'r2','u2').requests[1].depositStatus==='held','decision 5: refused at H+6 (unchanged)');
  // 6) partenaires : lieu déclaré absent = même règle que l’hôte
  const pm=()=>mk({},{isPartnerListing:true});
  const pp=HN(NS(pm()),NSAT+2*H);
  ok(pp.outings[0].hostNoShowCase.status==='pending'&&!pp.partnerWarningsByHost?.h1&&pp.requests[1].depositStatus==='held'&&pp.requests[0].noShowContestPausedAt,'decision 6: lieu absent → 24 h for the venue, no immediate warning, deposits pending, guest 24 h paused');
  ok(!PU.shouldAutoRefundPartnerSilence(pp.outings[0],pp.requests[1],T+48*H)&&D(pp,{type:'RETURN_DEPOSIT_SILENCE',payload:{requestId:'r2'}}).requests[1].depositStatus==='held','decision 6: « le lendemain » suspended while venue absence pending');
  ok(CH(pp,NSAT+2*H+D1-MIN).outings[0].hostNoShowCase.status==='contested'&&CH(pp,NSAT+2*H+D1).outings[0].hostNoShowCase.status==='pending','decision 6: venue contest 24 h − 1 min ok / 24 h refused');
  const pr=RETH(pp);
  ok(pr.outings[0].hostNoShowCase.status==='retained'&&pr.partnerWarningsByHost.h1===1&&!pr.hostNoShowStrikes.h1&&pr.requests[0].depositStatus==='returned'&&pr.requests[0].attendance===undefined&&pr.requests[1].depositStatus==='returned','decision 6: venue retained absent → partner warning, B, deposits returned');
  const pa=ACCH(back(CH(pp,NSAT+3*H)),NSAT+4*H);
  ok(pa.outings[0].hostNoShowReported===false&&!pa.partnerWarningsByHost?.h1&&pa.requests[0].depositStatus==='noshow_pending'&&!pa.requests[0].noShowContestPausedAt,'decision 6: venue contest accepted → no warning, guests back to normal');
  // « Je suis arrivé » après « Pas venu » = contestation ; caution déjà perdue : litige seul
  const arr=D(NS(pm()),{type:'GUEST_ARRIVED_PARTNER',payload:{requestId:'r1',arrivedAt:iso(NSAT+H)}});
  ok(arr.requests[0].depositStatus==='contested'&&arr.requests[0].noShowContest.viaArrival===true&&EXP(arr,NSAT+D1).requests[0].depositStatus==='contested','decision 6: arrival after « Pas venu » = contest, no 24 h loss');
  ok(!/Je suis arrivé|viaArrival/.test(JSON.stringify(arr.requests.map(require('../src/utils/leaveTable').projectRequestForHost))),'arrival contest invisible to the venue (host projection)');
  // texte : « La caution est rendue d’office »
  ok(require('../src/utils/refusalLabels').refusalLabel('too_late').includes('La caution est rendue d’office.')&&!require('../src/utils/refusalLabels').refusalLabel('too_late').includes('Elle est rendue'),'text: « La caution est rendue d’office »');
}

// QA 4ee894f : B1 à B4 (lettre du registre)
{
  const DH=require('../src/utils/depositH6');
  const LT=require('../src/utils/leaveTable');
  const RE=require('../src/utils/reviewEligibility');
  const MIN=60e3, D1=24*H, T=now-2*H, NSAT=T+H;
  const guest:any={...me};
  const mk=(more:any={})=>S({currentUser:guest,outings:[o({startsAt:iso(T),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})],...more});
  const HN=(s0:any,at:number,by='u2')=>D(s0,{type:'REPORT_HOST_NO_SHOW',payload:{outingId:'o1',hostId:'h1',strike:1,banned:false,reportedAt:iso(at),reportedByUserId:by}});
  const RETH=(s0:any)=>D(s0,{type:'EXPIRE_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso(Date.parse(s0.outings[0].hostNoShowCase.reportedAt)+D1)}});
  // B1 (L81) : joker et caution bloquée identiques pendant l’attente de l’hôte
  const pend=HN(mk(),T+2*H);
  const jok={...pend,requests:pend.requests.map((r:any)=>r.id==='r1'?{...r,depositStatus:'returned'}:r)};
  const lines=(x:any,at:number)=>x.requests.map((r:any)=>DH.hostReturnedDepositLine(LT.projectRequestForHost(r),x.outings[0],at));
  ok(JSON.stringify(lines(jok,T+3*H))==='[null,null]'&&JSON.stringify(lines(pend,T+3*H))==='[null,null]','B1: host absence pending before H+6 → joker return and held deposit both null');
  ok(JSON.stringify(lines(jok,T+7*H))==='[null,null]','B1: still no line after H+6 while host absence pending');
  const contested=D({...jok,currentUser:{...host}},{type:'CONTEST_HOST_NO_SHOW',payload:{outingId:'o1',note:'x',at:iso(T+3*H)}});
  ok(JSON.stringify(lines(contested,T+4*H))==='[null,null]','B1: no line during host review either');
  const ret=RETH(jok);
  ok(JSON.stringify(lines(ret,T+3*H))==='["Moi · caution rendue","Bea · caution rendue"]','B1: host absence retained → same line for every guest');
  const rex=D(contested,{type:'EXPIRE_HOST_NO_SHOW_REVIEW',payload:{outingId:'o1',at:iso(T+3*H+7*D1)}});
  ok(JSON.stringify(lines(rex,T+3*H+7*D1))==='["Moi · caution rendue","Bea · caution rendue"]','B1: host review expired at 7 d → same line for every guest');
  // B2 (L62, L79) : contestation acceptée → l’invité peut noter, table restée closed (sans forcer completed)
  const ns=D(mk(),{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(NSAT),reportedByUserId:'h1'}});
  const acc=D(D(ns,{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'j’y étais',at:iso(NSAT+MIN)}}),{type:'ACCEPT_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(NSAT+H)}});
  ok(acc.outings[0].status==='closed'&&RE.reviewEligibility({fromUserId:'u1',toUserId:'h1',outing:acc.outings[0],requests:acc.requests,reviews:[]}).ok===true,'B2: accepted contest, table closed → guest can rate');
  ok(RE.reviewEligibility({fromUserId:'u2',toUserId:'h1',outing:acc.outings[0],requests:acc.requests,reviews:[]}).reason==='not_completed'&&RE.reviewEligibility({fromUserId:'h1',toUserId:'u1',outing:acc.outings[0],requests:acc.requests,reviews:[]}).reason==='not_completed','B2: other cases unchanged on a closed table (other guest, host)');
  ok(RE.reviewEligibility({fromUserId:'u1',toUserId:'h1',outing:acc.outings[0],requests:acc.requests,reviews:[{outingId:'o1',fromUserId:'u1',toUserId:'h1'}]}).reason==='already_reviewed','B2: one rating only');
  // B3 (L70) : 2e absence annulée → priorité et mention levées
  const second=D(D(mk({guestNoShowStrikes:{u1:1}}),{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(NSAT),reportedByUserId:'h1'}}),{type:'EXPIRE_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(NSAT+D1)}});
  const b=RETH(HN(second,NSAT+2*H));
  ok(second.currentUser.lowerPriority===true&&b.currentUser.lowerPriority===false&&b.currentUser.profileMention===undefined&&b.guestNoShowStrikes.u1===1,'B3: B cancels lower priority and mention of this absence');
  // B4 (L73) : déclarant avec phrase, hôte présent → perdue
  const withNote=HN(D(ns,{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'au comptoir',at:iso(NSAT+MIN)}}),NSAT+2*H,'u1');
  const hostPresent=D(D({...withNote,currentUser:{...host}},{type:'CONTEST_HOST_NO_SHOW',payload:{outingId:'o1',note:'J’étais là',at:iso(NSAT+3*H)}}),{type:'ACCEPT_HOST_NO_SHOW_CONTEST',payload:{outingId:'o1',at:iso(NSAT+4*H)}});
  ok(withNote.requests[0].noShowContest.viaHostNoShow===true&&hostPresent.requests[0].depositStatus==='forfeited'&&hostPresent.guestNoShowStrikes.u1===1,'B4: declarer with sentence, host present → lost and counted');
}

// QA : B2 écran (L79) — liste « À noter » alignée sur reviewEligibility
{
  const RE=require('../src/utils/reviewEligibility');
  const MIN=60e3, T=now-2*H, NSAT=T+H;
  const guest:any={...me};
  const mk=()=>S({currentUser:guest,outings:[o({startsAt:iso(T),status:'closed'})],requests:[rq({status:'confirmed',depositStatus:'held'}),rq({id:'r2',userId:'u2',userName:'Bea',status:'confirmed',depositStatus:'held'})]});
  const ns=D(mk(),{type:'REPORT_GUEST_NO_SHOW',payload:{outingId:'o1',requestId:'r1',guestId:'u1',strike:1,lowerPriority:false,reportedAt:iso(NSAT),reportedByUserId:'h1'}});
  const acc=D(D(ns,{type:'CONTEST_NO_SHOW',payload:{requestId:'r1',note:'j’y étais',at:iso(NSAT+MIN)}}),{type:'ACCEPT_NO_SHOW_CONTEST',payload:{requestId:'r1',at:iso(NSAT+H)}});
  const L=(x:any,uid:string)=>RE.listOutingsToRate({userId:uid,outings:x.outings,requests:x.requests,reviews:x.reviews});
  const items=L(acc,'u1');
  ok(acc.outings[0].status==='closed'&&items.length===1&&items[0].outing.id==='o1'&&items[0].toUserId==='h1'&&items[0].requestId==='r1','B2 screen: accepted contest on a closed table → listed in getOutingsToRate (host to rate)');
  ok(L(acc,'u2').length===0&&L(acc,'h1').length===0&&L(ns,'u1').length===0,'B2 screen: nobody else listed (other guest, host, pending « Pas venu »)');
  ok(L({...acc,reviews:[{outingId:'o1',fromUserId:'u1',toUserId:'h1',rating:5}]},'u1').length===0,'B2 screen: rated → out of the list');
  // moment terminé : liste inchangée pour les présents et l’hôte
  const done={...acc,outings:[{...acc.outings[0],status:'completed'}],requests:acc.requests.map((r:any)=>r.id==='r2'?{...r,attendance:'present'}:r)};
  ok(JSON.stringify(L(done,'u2').map((i:any)=>i.toUserId))==='["h1"]'&&JSON.stringify(L(done,'h1').map((i:any)=>i.toUserId))==='["u2"]','B2 screen: completed table → present guest and host lists unchanged');
  ok(L(done,'u1').length===1,'B2 screen: accepted contest also listed once completed');
  const fs=require('node:fs'), path=require('node:path');
  const ctx=fs.readFileSync(path.join(__dirname,'..','src','data','ChanceContext.tsx'),'utf8');
  ok(/const getOutingsToRate = useCallback\(\s*\(\) =>[\s\S]{0,120}listOutingsToRate\(/.test(ctx),'static: getOutingsToRate delegates to listOutingsToRate');
}
console.log({pass,fail});
if(fail) process.exitCode=1;
