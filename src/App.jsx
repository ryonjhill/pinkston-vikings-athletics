import React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";

// ─── GOOGLE PLACES AUTOCOMPLETE ───────────────────────────────────────────────
const GOOGLE_PLACES_KEY = "AIzaSyB--lmmPax6pMWaLxeF9QZG9ICw8iVJ7fo";

let googlePlacesLoading = false;
let googlePlacesLoaded = false;
const googlePlacesCallbacks = [];

function loadGooglePlaces(cb) {
  if(googlePlacesLoaded && window.google?.maps?.places) { cb(); return; }
  googlePlacesCallbacks.push(cb);
  if(googlePlacesLoading) return;
  googlePlacesLoading = true;
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_KEY}&libraries=places&callback=__googlePlacesReady`;
  script.async = true;
  script.defer = true;
  window.__googlePlacesReady = () => {
    googlePlacesLoaded = true;
    googlePlacesLoading = false;
    googlePlacesCallbacks.forEach(fn => fn());
    googlePlacesCallbacks.length = 0;
  };
  script.onerror = () => {
    googlePlacesLoading = false;
    // silently fail — fall back to plain text input
  };
  document.head.appendChild(script);
}

function LocationInput({value, onChange, placeholder='e.g. Main Gym, Vikings Field...'}) {
  const inputRef = React.useRef(null);
  const autocompleteRef = React.useRef(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      loadGooglePlaces(() => setReady(true));
    }, 100);
    const fallback = setTimeout(() => {
      if(!googlePlacesLoaded) setFailed(true);
    }, 5000);
    return () => { clearTimeout(timer); clearTimeout(fallback); };
  }, []);

  React.useEffect(() => {
    if(!ready || !inputRef.current || autocompleteRef.current) return;
    try {
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address', 'name'],
      });
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        const loc = place.name && place.formatted_address
          ? `${place.name}, ${place.formatted_address}`
          : place.formatted_address || place.name || '';
        onChange(loc);
        if(inputRef.current) inputRef.current.value = loc;
      });
    } catch(e) {
      setFailed(true);
    }
  }, [ready]);

  // If Places API failed, show plain text input
  if(failed) {
    return <input
      style={{width:'100%',padding:'9px 12px',border:'0.5px solid rgba(0,0,0,0.18)',borderRadius:7,fontFamily:"'Source Sans 3',sans-serif",fontSize:14,color:'#0d0d0d',background:'#fff',outline:'none'}}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />;
  }

  return (
    <div style={{position:'relative'}}>
      <input
        ref={inputRef}
        style={{width:'100%',padding:'9px 12px',border:'0.5px solid rgba(0,0,0,0.18)',borderRadius:7,fontFamily:"'Source Sans 3',sans-serif",fontSize:14,color:'#0d0d0d',background:'#fff',outline:'none'}}
        placeholder={ready ? placeholder : '📍 Loading location search...'}
        defaultValue={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, sendPasswordResetEmail
} from "firebase/auth";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, limit
} from "firebase/firestore";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "firebase/storage";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB--lmmPax6pMWaLxeF9QZG9ICw8iVJ7fo",
  authDomain: "pinkston-vikings.firebaseapp.com",
  projectId: "pinkston-vikings",
  storageBucket: "pinkston-vikings.firebasestorage.app",
  messagingSenderId: "745116012580",
  appId: "1:745116012580:web:524e7ccecb9e81c33c88b1"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SPORTS = [
  {key:'Football',icon:'🏈'},{key:"Men's Basketball",icon:'🏀'},
  {key:"Women's Basketball",icon:'🏀'},{key:'Baseball',icon:'⚾'},
  {key:'Softball',icon:'🥎'},{key:"Men's Track",icon:'🏃'},
  {key:"Women's Track",icon:'🏃'},{key:"Men's Soccer",icon:'⚽'},
  {key:"Women's Soccer",icon:'⚽'},{key:'Volleyball',icon:'🏐'},
  {key:'Wrestling',icon:'🤼'},{key:'Swimming',icon:'🏊'},
  {key:'Tennis',icon:'🎾'},{key:'Golf',icon:'⛳'},
];
const PHOTO_CATS = ['Game Action','Team Photos','Events & Banners','Alumni Gallery'];
const AUDIENCE_OPTS = [
  {val:'all',label:'Everyone'},
  {val:'athletes_parents',label:'Athletes & Parents'},
  {val:'coaches',label:'Coaches Only'},
  {val:'fans_alumni',label:'Fans & Alumni'},
];
const INJURY_TYPES = ['Sprain','Strain','Fracture','Concussion','Bruise','Laceration','Overuse','Other'];
const INJURY_STATUS = ['Active','Recovering','Cleared'];

// ─── THEME ────────────────────────────────────────────────────────────────────
const G = {
  black:'#0d0d0d',blackMid:'#1a1a1a',
  gold:'#c9961a',goldLight:'#e5b02a',goldPale:'#fdf3d8',
  white:'#fff',off:'#f2f0ec',muted:'#888',
  red:'#c0392b',green:'#1a6636',greenBg:'#e6f4ec',redBg:'#fce8e8',
  blue:'#1e40af',blueBg:'#dbeafe',
  orange:'#c2410c',orangeBg:'#fff7ed',
  purple:'#6b21a8',purpleBg:'#f3e8ff',
};

const s = {
  page:{background:G.off,minHeight:'100vh',fontFamily:"'Source Sans 3',sans-serif",color:G.black},
  header:{background:G.black,position:'relative',overflow:'hidden'},
  headerInner:{display:'flex',alignItems:'center',gap:18,padding:'22px 24px 18px'},
  mascot:{width:64,height:64,objectFit:'contain',flexShrink:0},
  schoolName:{fontFamily:"'Oswald',sans-serif",fontSize:10,letterSpacing:'2.5px',textTransform:'uppercase',color:G.gold,marginBottom:4},
  teamName:{fontFamily:"'Oswald',sans-serif",fontSize:32,fontWeight:700,color:G.white,lineHeight:1,letterSpacing:1},
  tagline:{fontSize:12,color:'rgba(255,255,255,0.4)',marginTop:3},
  goldBar:{height:3,background:`linear-gradient(90deg,${G.gold},${G.goldLight},${G.gold})`},
  nav:{background:G.blackMid,display:'flex',overflowX:'auto',borderBottom:`1px solid rgba(201,150,26,0.2)`},
  navBtn:(a)=>({fontFamily:"'Oswald',sans-serif",fontSize:12,fontWeight:500,letterSpacing:'1.5px',textTransform:'uppercase',color:a?G.gold:'rgba(255,255,255,0.45)',padding:'13px 16px',border:'none',background:'transparent',cursor:'pointer',whiteSpace:'nowrap',borderBottom:a?`2px solid ${G.gold}`:'2px solid transparent',position:'relative'}),
  content:{padding:'20px 20px 48px'},
  card:{background:G.white,borderRadius:10,border:`0.5px solid rgba(0,0,0,0.08)`,padding:'16px 18px',marginBottom:12},
  cardTitle:{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:G.black,marginBottom:14},
  pageHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:10},
  pageTitle:{fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:600,color:G.black,letterSpacing:'0.5px'},
  pageSub:{fontSize:13,color:G.muted,marginLeft:8},
  btn:(v='primary')=>{const m={primary:{background:G.black,color:G.gold},gold:{background:G.gold,color:G.black},outline:{background:'transparent',border:`0.5px solid rgba(0,0,0,0.2)`,color:G.black},danger:{background:G.redBg,color:G.red,border:`0.5px solid rgba(192,57,43,0.2)`},green:{background:G.greenBg,color:G.green,border:`0.5px solid rgba(26,102,54,0.2)`}};return{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:500,letterSpacing:'1px',textTransform:'uppercase',padding:'10px 20px',borderRadius:7,cursor:'pointer',border:'none',...(m[v]||m.primary)};},
  btnSm:{padding:'6px 12px',fontSize:11},
  input:{width:'100%',padding:'9px 12px',border:`0.5px solid rgba(0,0,0,0.18)`,borderRadius:7,fontFamily:"'Source Sans 3',sans-serif",fontSize:14,color:G.black,background:G.white,outline:'none'},
  label:{fontSize:12,fontWeight:500,color:G.muted,textTransform:'uppercase',letterSpacing:'0.8px',display:'block',marginBottom:5},
  badge:(role)=>{const m={admin:{background:'#f0fdf4',color:'#166534'},coach:{background:G.goldPale,color:'#92640a'},athlete:{background:G.blueBg,color:G.blue},parent:{background:G.purpleBg,color:G.purple},fan:{background:'#fce7f3',color:'#9d174d'},alumni:{background:'#fff7ed',color:'#9a3412'},approved:{background:G.greenBg,color:G.green},pending:{background:'#fef9c3',color:'#854d0e'},Active:{background:G.redBg,color:G.red},Recovering:{background:G.orangeBg,color:G.orange},Cleared:{background:G.greenBg,color:G.green}};const st=m[role]||{background:G.off,color:G.muted};return{display:'inline-block',fontFamily:"'Oswald',sans-serif",fontSize:10,letterSpacing:'0.8px',textTransform:'uppercase',padding:'2px 7px',borderRadius:4,...st};},
  pill:(a)=>({fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:'1px',textTransform:'uppercase',padding:'5px 14px',borderRadius:20,border:`0.5px solid ${a?G.black:'rgba(0,0,0,0.12)'}`,background:a?G.black:G.white,cursor:'pointer',color:a?G.gold:G.muted}),
  statGrid:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16},
  statBlock:{background:G.white,borderRadius:10,border:`0.5px solid rgba(0,0,0,0.08)`,padding:'14px 12px 12px',textAlign:'center'},
  statNum:{fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:700,color:G.black,lineHeight:1},
  statLbl:{fontSize:11,color:G.muted,marginTop:4,textTransform:'uppercase',letterSpacing:'0.8px'},
};

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function Badge({role,children}){return <span style={s.badge(role)}>{children||role}</span>;}
function Btn({variant='primary',sm,onClick,children,style={},disabled=false}){return <button disabled={disabled} style={{...s.btn(variant),...(sm?s.btnSm:{}),...style,opacity:disabled?0.5:1}} onClick={onClick}>{children}</button>;}
function Card({children,style={}}){return <div style={{...s.card,...style}}>{children}</div>;}
function CardTitle({children}){return <div style={s.cardTitle}>{children}</div>;}
function FilterBar({cats,active,onChange}){return <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>{cats.map(c=><button key={c} style={s.pill(active===c)} onClick={()=>onChange(c)}>{c}</button>)}</div>;}
function StatGrid({stats}){return <div style={s.statGrid}>{stats.map(({num,lbl,color})=><div key={lbl} style={s.statBlock}><div style={{...s.statNum,color:color||G.black}}>{num}</div><div style={s.statLbl}>{lbl}</div></div>)}</div>;}
function Spinner(){return <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:40}}><div style={{width:32,height:32,border:`3px solid ${G.off}`,borderTop:`3px solid ${G.gold}`,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;}
function Empty({msg='No data yet.'}){return <div style={{color:G.muted,fontSize:13,padding:'16px 0',textAlign:'center'}}>{msg}</div>;}

function GameBadge({b}){
  const m={home:{background:G.black,color:G.gold},away:{background:G.off,color:G.black,border:`0.5px solid rgba(0,0,0,0.1)`},win:{background:G.greenBg,color:G.green},loss:{background:G.redBg,color:G.red}};
  const l={home:'Home',away:'Away',win:'W',loss:'L'};
  return <span style={{fontFamily:"'Oswald',sans-serif",fontSize:11,fontWeight:500,letterSpacing:'0.8px',padding:'3px 8px',borderRadius:4,whiteSpace:'nowrap',...(m[b]||m.away)}}>{l[b]||b}</span>;
}

// ── MAPS LINK HELPER ─────────────────────────────────────────────────────────
function LocationLink({text,style={}}){
  if(!text) return null;
  // Extract just the location part (after the last ·)
  const parts = text.split('·');
  const location = parts[parts.length-1].trim();
  const time = parts.slice(0,-1).join('·').trim();
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(location)}`;
  return <span>
    {time&&<span>{time} · </span>}
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{color:'#1e40af',textDecoration:'underline',fontSize:'inherit',...style}}
      onClick={e=>e.stopPropagation()}>📍 {location}</a>
  </span>;
}

function GameItem({g,showLive=false}){
  return <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:`0.5px solid ${G.off}`}}>
    <div style={{width:42,textAlign:'center',flexShrink:0}}>
      <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',color:G.gold,letterSpacing:'1px',lineHeight:1}}>{g.month}</div>
      <div style={{fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:700,color:G.black,lineHeight:1.1}}>{g.day}</div>
    </div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontWeight:600,fontSize:14,color:G.black}}>{g.opponent}</div>
      <div style={{fontSize:12,color:G.muted,marginTop:2}}>{g.sport?`${g.sport} · `:''}<LocationLink text={g.details}/></div>
      {showLive&&g.liveScore?.live&&<div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
        <span style={{background:G.red,color:'#fff',fontSize:9,fontFamily:"'Oswald',sans-serif",fontWeight:700,padding:'1px 6px',borderRadius:4,letterSpacing:'1px'}}>● LIVE</span>
        <span style={{fontFamily:"'Oswald',sans-serif",fontSize:14,fontWeight:700,color:G.black}}>Vikings {g.liveScore.us} – {g.liveScore.them}</span>
        <span style={{fontSize:11,color:G.muted}}>{g.liveScore.quarter}</span>
      </div>}
    </div>
    <GameBadge b={g.badge}/>
  </div>;
}

function AnnItem({ann}){
  return <div style={{display:'flex',gap:14,padding:'12px 0',borderBottom:`0.5px solid ${G.off}`}}>
    <div style={{width:8,height:8,borderRadius:'50%',background:G.gold,flexShrink:0,marginTop:5}}/>
    <div style={{flex:1}}>
      <div style={{fontWeight:600,fontSize:14,color:G.black,marginBottom:2}}>{ann.title}</div>
      <div style={{fontSize:13,color:'#555',lineHeight:1.5}}>{ann.body}</div>
      <div style={{fontSize:11,color:G.muted,marginTop:3}}>{ann.date} · {ann.coach}</div>
    </div>
  </div>;
}

function Modal({title,onClose,children}){
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{background:G.white,borderRadius:12,padding:24,width:'90%',maxWidth:460,maxHeight:'88vh',overflowY:'auto'}}>
      <div style={{fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:600,color:G.black,marginBottom:16}}>{title}</div>
      {children}
    </div>
  </div>;
}

function Toast({msg}){
  return <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',background:G.black,color:G.gold,fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:'0.8px',padding:'10px 20px',borderRadius:8,zIndex:2000,whiteSpace:'nowrap',pointerEvents:'none'}}>{msg}</div>;
}

function PhotoGrid({photos,onPhotoClick}){
  const [hov,setHov]=React.useState(null);
  return <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
    {photos.map((p,i)=><div key={p.id||i} onClick={()=>onPhotoClick(i)} onMouseEnter={()=>setHov(p.id)} onMouseLeave={()=>setHov(null)}
      style={{position:'relative',aspectRatio:'1',borderRadius:8,overflow:'hidden',cursor:'pointer',background:G.off}}>
      <img src={p.src||p.storageUrl} alt={p.title} style={{width:'100%',height:'100%',objectFit:'cover',transition:'transform 0.2s',transform:hov===p.id?'scale(1.05)':'scale(1)'}}/>
      <div style={{position:'absolute',top:7,left:7,background:'rgba(0,0,0,0.65)',color:'#fff',fontFamily:"'Oswald',sans-serif",fontSize:9,letterSpacing:'0.8px',textTransform:'uppercase',padding:'2px 6px',borderRadius:4}}>{p.cat||p.category}</div>
      <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 50%)',opacity:hov===p.id?1:0,transition:'opacity 0.2s',display:'flex',alignItems:'flex-end',padding:8}}>
        <div style={{color:'#fff'}}>
          <div style={{fontWeight:600,fontSize:12}}>{p.title}</div>
          <div style={{fontSize:11,marginTop:2}}>{p.sport!=='ALL'?p.sport+' · ':''}{p.date||p.uploadDate} · ❤️ {p.likes||0}</div>
        </div>
      </div>
    </div>)}
  </div>;
}

function Lightbox({photos,idx,onClose,onNav}){
  const p=photos[idx];
  React.useEffect(()=>{
    const h=e=>{if(e.key==='ArrowLeft')onNav(-1);if(e.key==='ArrowRight')onNav(1);if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[onNav,onClose]);
  if(!p)return null;
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.93)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column'}}>
    <button onClick={onClose} style={{position:'absolute',top:16,right:16,background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',fontSize:20,width:40,height:40,borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
    <button onClick={()=>onNav(-1)} style={{position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',fontSize:28,padding:'10px 14px',borderRadius:8,cursor:'pointer'}}>‹</button>
    <img src={p.src||p.storageUrl} alt={p.title} style={{maxWidth:'88vw',maxHeight:'68vh',borderRadius:8,objectFit:'contain'}}/>
    <div style={{marginTop:16,textAlign:'center'}}>
      <div style={{fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:600,color:'#fff'}}>{p.title}</div>
      <div style={{fontSize:13,color:'rgba(255,255,255,0.55)',marginTop:4}}>{p.cat||p.category} · {p.uploader} · {p.date||p.uploadDate} · ❤️ {p.likes||0}</div>
    </div>
    <div style={{display:'flex',gap:6,marginTop:14}}>{photos.map((_,i)=><div key={i} onClick={()=>onNav(i-idx)} style={{width:6,height:6,borderRadius:'50%',background:i===idx?G.gold:'rgba(255,255,255,0.3)',cursor:'pointer'}}/>)}</div>
    <button onClick={()=>onNav(1)} style={{position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',fontSize:28,padding:'10px 14px',borderRadius:8,cursor:'pointer'}}>›</button>
  </div>;
}

// ─── FIRESTORE HELPERS ────────────────────────────────────────────────────────
const fdb = {
  add: (col, data) => addDoc(collection(db, col), {...data, createdAt: serverTimestamp()}),
  set: (col, id, data) => setDoc(doc(db, col, id), {...data, updatedAt: serverTimestamp()}),
  update: (col, id, data) => updateDoc(doc(db, col, id), data),
  delete: (col, id) => deleteDoc(doc(db, col, id)),
  get: (col, id) => getDoc(doc(db, col, id)),
  getAll: async (col, constraints=[]) => {
    const q = constraints.length ? query(collection(db, col), ...constraints) : collection(db, col);
    const snap = await getDocs(q);
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  },
  listen: (col, constraints=[], cb) => {
    const q = constraints.length ? query(collection(db, col), ...constraints) : collection(db, col);
    return onSnapshot(q, snap => cb(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },
  listenDoc: (col, id, cb) => onSnapshot(doc(db, col, id), snap => cb(snap.exists()?{id:snap.id,...snap.data()}:null)),
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser] = useState(null); // Firebase auth user
  const [userProfile, setUserProfile] = useState(null); // Firestore user doc
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [toast, setToast] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [regRole, setRegRole] = useState('athlete');

  const notify = msg => { setToast(msg); setTimeout(()=>setToast(''), 3500); };

  // ── AUTH STATE LISTENER ──
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      if(firebaseUser) {
        setAuthUser(firebaseUser);
        // Load user profile from Firestore
        const snap = await fdb.get('users', firebaseUser.uid);
        if(snap.exists()) {
          setUserProfile({id: firebaseUser.uid, ...snap.data()});
        }
      } else {
        setAuthUser(null);
        setUserProfile(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── LOGIN ──
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetErr, setResetErr] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const doLogin = async () => {
    setLoginErr(''); setLoginLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPw);
      setTab('dashboard');
    } catch(e) {
      setLoginErr(e.code==='auth/invalid-credential'?'Invalid email or password. Please try again.':e.message);
    }
    setLoginLoading(false);
  };

  const doResetPassword = async () => {
    setResetErr(''); setResetMsg(''); setResetLoading(true);
    if(!resetEmail){setResetErr('Please enter your email address.');setResetLoading(false);return;}
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMsg('Password reset email sent! Check your inbox and follow the link to reset your password.');
    } catch(e) {
      setResetErr(e.code==='auth/user-not-found'?'No account found with that email address.':e.code==='auth/invalid-email'?'Please enter a valid email address.':e.message);
    }
    setResetLoading(false);
  };

  const doLogout = async () => {
    await signOut(auth);
    setTab('dashboard');
    setUserProfile(null);
  };

  // ── REGISTER ──
  const [regF, setRegF] = useState({first:'',last:'',email:'',phone:'',pw:'',grade:'9th',jersey:'',sport:'',childName:'',childId:'',gradYear:'',sportPlayed:''});
  const [regErr, setRegErr] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [athleteSearch, setAthleteSearch] = useState('');
  const [athleteResults, setAthleteResults] = useState([]);
  const [athleteSearchLoading, setAthleteSearchLoading] = useState(false);

  // Live athlete search for parent registration
  const searchAthletes = async (term) => {
    setAthleteSearch(term);
    setRegF(f=>({...f, childName: term, childId: ''}));
    if(term.length < 2) { setAthleteResults([]); return; }
    setAthleteSearchLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'users'), where('role','==','athlete'), where('approved','==',true)));
      const matches = snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .filter(u=>u.name?.toLowerCase().includes(term.toLowerCase()));
      setAthleteResults(matches.slice(0,5));
    } catch(e) { setAthleteResults([]); }
    setAthleteSearchLoading(false);
  };

  const selectAthlete = (athlete) => {
    setAthleteSearch(athlete.name);
    setRegF(f=>({...f, childName: athlete.name, childId: athlete.id}));
    setAthleteResults([]);
  };

  const doRegister = async () => {
    setRegErr(''); setRegLoading(true);
    if(!regF.first||!regF.email||!regF.pw){setRegErr('Please fill in all required fields.');setRegLoading(false);return;}
    if(regF.pw.length<6){setRegErr('Password must be at least 6 characters.');setRegLoading(false);return;}
    if(regRole==='parent'&&!regF.childName){setRegErr('Please search for and select your child.');setRegLoading(false);return;}
    try {
      const cred = await createUserWithEmailAndPassword(auth, regF.email, regF.pw);
      const uid = cred.user.uid;
      const autoApprove = regRole==='fan'||regRole==='alumni';
      const profile = {
        name: `${regF.first} ${regF.last}`.trim(),
        email: regF.email,
        phone: regF.phone,
        role: regRole,
        approved: autoApprove,
        createdAt: serverTimestamp(),
        ...(regRole==='athlete'?{sport:null,jersey:regF.jersey,grade:regF.grade}:{}),
        ...(regRole==='coach'?{sport:regF.sport}:{}),
        ...(regRole==='parent'?{childName:regF.childName, childId:regF.childId||null}:{}),
        ...(regRole==='alumni'?{gradYear:regF.gradYear,sportPlayed:regF.sportPlayed}:{}),
      };
      await fdb.set('users', uid, profile);
      setUserProfile({id: uid, ...profile});
      setTab('dashboard');
      if(!autoApprove) notify('Account created! Awaiting admin/coach approval.');
    } catch(e) {
      setRegErr(e.code==='auth/email-already-in-use'?'That email is already registered.':e.message);
    }
    setRegLoading(false);
  };

  // ── NAV TABS ──
  const navTabs = {
    admin:[{id:'dashboard',label:'Dashboard'},{id:'photos',label:'Photos'},{id:'schedule',label:'Schedule'},{id:'calendar',label:'Calendar'},{id:'roster',label:'Roster'},{id:'attendance',label:'Attendance'},{id:'health',label:'Health Log'},{id:'broadcast',label:'Broadcast'},{id:'stats',label:'Stats'},{id:'messages',label:'Messages'},{id:'approvals',label:'Approvals'},{id:'profile',label:'My Profile'}],
    coach:[{id:'dashboard',label:'Dashboard'},{id:'photos',label:'Photos'},{id:'my-team',label:'My Team'},{id:'schedule',label:'Schedule'},{id:'calendar',label:'Calendar'},{id:'announcements',label:'Announce'},{id:'attendance',label:'Attendance'},{id:'health',label:'Health Log'},{id:'broadcast',label:'Broadcast'},{id:'messages',label:'Messages'},{id:'profile',label:'My Profile'}],
    athlete:[{id:'dashboard',label:'Dashboard'},{id:'photos',label:'Photos'},{id:'my-sports',label:'My Sports'},{id:'schedule',label:'Schedule'},{id:'calendar',label:'Calendar'},{id:'stats',label:'Stats'},{id:'profile',label:'My Profile'}],
    parent:[{id:'dashboard',label:'Dashboard'},{id:'photos',label:'Photos'},{id:'schedule',label:'Schedule'},{id:'calendar',label:'Calendar'},{id:'attendance',label:'Attendance'},{id:'messages',label:'Messages'},{id:'notifications',label:'Notifications'},{id:'profile',label:'My Profile'}],
    fan:[{id:'dashboard',label:'Dashboard'},{id:'community',label:'Fan Zone'},{id:'photos',label:'Photos'},{id:'schedule',label:'Schedule'},{id:'calendar',label:'Calendar'},{id:'stats',label:'Stats'},{id:'profile',label:'My Profile'}],
    alumni:[{id:'dashboard',label:'Dashboard'},{id:'community',label:'Fan Zone'},{id:'photos',label:'Photos'},{id:'schedule',label:'Schedule'},{id:'calendar',label:'Calendar'},{id:'stats',label:'Stats'},{id:'profile',label:'My Profile'}],
  };
  const tabs = userProfile ? (navTabs[userProfile.role]||navTabs.fan) : [];

  // ── LOADING STATE ──
  if(authLoading) return (
    <div style={{...s.page, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16}}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet"/>
      <img src="https://image.maxpreps.io/school-mascot/2/c/a/2ca3712c-3b97-4458-9d65-3d773dad62ea.gif?version=637987468200000000&width=128&height=128&auto=webp&format=pjpg" style={{width:80,height:80,objectFit:'contain'}} alt="Vikings"/>
      <div style={{fontFamily:"'Oswald',sans-serif",fontSize:24,fontWeight:700,color:G.black}}>VIKINGS</div>
      <Spinner/>
    </div>
  );

  // ── AUTH SCREEN ──
  if(!authUser || !userProfile) return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div style={s.header}>
        <div style={s.headerInner}>
          <img src="https://image.maxpreps.io/school-mascot/2/c/a/2ca3712c-3b97-4458-9d65-3d773dad62ea.gif?version=637987468200000000&width=128&height=128&auto=webp&format=pjpg" style={s.mascot} alt="Vikings" onError={e=>e.target.style.display='none'}/>
          <div>
            <div style={s.schoolName}>Dr. L.G. Pinkston Sr. High School</div>
            <div style={s.teamName}>VIKINGS</div>
            <div style={s.tagline}>Athletics Program · Dallas, TX</div>
          </div>
        </div>
        <div style={s.goldBar}/>
      </div>
      <div style={{padding:'32px 20px'}}>
        <div style={{maxWidth:420,margin:'0 auto'}}>
          <div style={{display:'flex',border:`0.5px solid rgba(0,0,0,0.12)`,borderRadius:8,overflow:'hidden',marginBottom:20}}>
            {['login','register'].map(m=><button key={m} onClick={()=>{setAuthMode(m);setLoginErr('');setRegErr('');}} style={{flex:1,padding:10,fontFamily:"'Oswald',sans-serif",fontSize:12,letterSpacing:'1px',textTransform:'uppercase',border:'none',background:authMode===m?G.black:G.white,cursor:'pointer',color:authMode===m?G.gold:G.muted}}>{m==='login'?'Sign In':'Register'}</button>)}
          </div>

          {authMode==='login' ? (
            showReset ? (
              <Card>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                  <button onClick={()=>{setShowReset(false);setResetMsg('');setResetErr('');}} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:G.muted,padding:0}}>←</button>
                  <CardTitle style={{margin:0}}>Reset Password</CardTitle>
                </div>
                {resetMsg ? (
                  <div style={{background:G.greenBg,border:`0.5px solid rgba(26,102,54,0.2)`,borderRadius:8,padding:'14px',fontSize:13,color:G.green,lineHeight:1.6}}>
                    ✅ {resetMsg}
                    <div style={{marginTop:12}}><button onClick={()=>{setShowReset(false);setResetMsg('');}} style={{...s.btn('primary'),...s.btnSm}}>Back to Sign In</button></div>
                  </div>
                ) : (
                  <>
                    <div style={{fontSize:13,color:'#555',lineHeight:1.6,marginBottom:16}}>Enter the email address you registered with and we'll send you a link to reset your password.</div>
                    <div style={{marginBottom:12}}>
                      <label style={s.label}>Email Address</label>
                      <input style={s.input} type="email" placeholder="your@email.com" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doResetPassword()}/>
                    </div>
                    {resetErr&&<div style={{color:G.red,fontSize:13,marginBottom:12,background:G.redBg,padding:'8px 12px',borderRadius:6}}>{resetErr}</div>}
                    <Btn variant="primary" style={{width:'100%'}} onClick={doResetPassword} disabled={resetLoading}>{resetLoading?'Sending...':'Send Reset Link'}</Btn>
                  </>
                )}
              </Card>
            ) : (
            <Card>
              <CardTitle>Welcome Back, Vikings</CardTitle>
              <div style={{marginBottom:12}}>
                <label style={s.label}>Email</label>
                <input style={s.input} type="email" placeholder="your@email.com" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
              </div>
              <div style={{marginBottom:6}}>
                <label style={s.label}>Password</label>
                <input style={s.input} type="password" placeholder="••••••••" value={loginPw} onChange={e=>setLoginPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
              </div>
              <div style={{textAlign:'right',marginBottom:16}}>
                <button onClick={()=>{setShowReset(true);setResetEmail(loginEmail);setResetErr('');setResetMsg('');}} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:G.gold,fontFamily:"'Source Sans 3',sans-serif",textDecoration:'underline',padding:0}}>Forgot password?</button>
              </div>
              {loginErr&&<div style={{color:G.red,fontSize:13,marginBottom:12,background:G.redBg,padding:'8px 12px',borderRadius:6}}>{loginErr}</div>}
              <Btn variant="primary" style={{width:'100%'}} onClick={doLogin} disabled={loginLoading}>{loginLoading?'Signing in...':'Sign In'}</Btn>
              <div style={{marginTop:16,padding:'12px',background:G.off,borderRadius:8}}>
                <div style={{fontSize:12,color:G.muted,marginBottom:8,fontFamily:"'Oswald',sans-serif",letterSpacing:'0.8px',textTransform:'uppercase'}}>First time here?</div>
                <div style={{fontSize:13,color:'#555',lineHeight:1.6}}>Click <strong>Register</strong> above to create your account. Coaches, athletes, and parents need admin approval before accessing the app.</div>
              </div>
            </Card>
            )
          ) : (
            <Card>
              <CardTitle>Create Account</CardTitle>
              <div style={{marginBottom:14}}>
                <div style={s.label}>I am a...</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:8,marginBottom:4}}>
                  {[{r:'athlete',icon:'🏃'},{r:'coach',icon:'📋'},{r:'parent',icon:'👨‍👩‍👧'},{r:'admin',icon:'⚙️'},{r:'fan',icon:'📣'},{r:'alumni',icon:'🎓'}].map(({r,icon})=>(
                    <div key={r} onClick={()=>setRegRole(r)} style={{border:`0.5px solid ${regRole===r?G.gold:'rgba(0,0,0,0.12)'}`,borderRadius:8,padding:'12px 8px',textAlign:'center',cursor:'pointer',background:regRole===r?G.goldPale:G.white}}>
                      <div style={{fontSize:22,marginBottom:5}}>{icon}</div>
                      <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:'0.8px',textTransform:'uppercase'}}>{r}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div><label style={s.label}>First Name *</label><input style={s.input} placeholder="First" value={regF.first} onChange={e=>setRegF(f=>({...f,first:e.target.value}))}/></div>
                <div><label style={s.label}>Last Name</label><input style={s.input} placeholder="Last" value={regF.last} onChange={e=>setRegF(f=>({...f,last:e.target.value}))}/></div>
              </div>
              <div style={{marginBottom:12}}><label style={s.label}>Email *</label><input style={s.input} type="email" placeholder="your@email.com" value={regF.email} onChange={e=>setRegF(f=>({...f,email:e.target.value}))}/></div>
              <div style={{marginBottom:12}}><label style={s.label}>Phone (for SMS alerts)</label><input style={s.input} type="tel" placeholder="(214) 555-0100" value={regF.phone} onChange={e=>setRegF(f=>({...f,phone:e.target.value}))}/></div>
              <div style={{marginBottom:12}}><label style={s.label}>Password * (min 6 chars)</label><input style={s.input} type="password" placeholder="••••••••" value={regF.pw} onChange={e=>setRegF(f=>({...f,pw:e.target.value}))}/></div>
              {regRole==='athlete'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div><label style={s.label}>Grade</label><select style={s.input} value={regF.grade} onChange={e=>setRegF(f=>({...f,grade:e.target.value}))}>{['9th','10th','11th','12th'].map(g=><option key={g}>{g}</option>)}</select></div>
                <div><label style={s.label}>Jersey #</label><input style={s.input} placeholder="12" value={regF.jersey} onChange={e=>setRegF(f=>({...f,jersey:e.target.value}))}/></div>
              </div>}
              {regRole==='coach'&&<div style={{marginBottom:12}}><label style={s.label}>Sport</label><select style={s.input} value={regF.sport} onChange={e=>setRegF(f=>({...f,sport:e.target.value}))}><option value="">Select sport...</option>{SPORTS.map(sp=><option key={sp.key} value={sp.key}>{sp.key}</option>)}</select></div>}
              {regRole==='parent'&&<div style={{marginBottom:12,position:'relative'}}>
                <label style={s.label}>Search for Your Child</label>
                <input style={s.input} placeholder="Type your child's name..." value={athleteSearch} onChange={e=>searchAthletes(e.target.value)}/>
                {regF.childId&&<div style={{fontSize:12,color:G.green,marginTop:4}}>✅ Linked to {regF.childName}</div>}
                {!regF.childId&&athleteSearch.length>=2&&athleteResults.length===0&&!athleteSearchLoading&&<div style={{fontSize:12,color:G.muted,marginTop:4}}>No athletes found. Admin will link your account manually.</div>}
                {athleteSearchLoading&&<div style={{fontSize:12,color:G.muted,marginTop:4}}>Searching...</div>}
                {athleteResults.length>0&&<div style={{position:'absolute',top:'100%',left:0,right:0,background:G.white,border:'0.5px solid rgba(0,0,0,0.15)',borderRadius:7,zIndex:100,boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
                  {athleteResults.map(a=><div key={a.id} onClick={()=>selectAthlete(a)} style={{padding:'10px 12px',cursor:'pointer',borderBottom:'0.5px solid #f2f0ec',fontSize:13,display:'flex',alignItems:'center',justifyContent:'space-between'}} onMouseEnter={e=>e.currentTarget.style.background='#fdf3d8'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{fontWeight:600,color:'#0d0d0d'}}>{a.name}</span>
                    <span style={{fontSize:11,color:'#888'}}>{a.sport||'No sport yet'} · Grade {a.grade||'—'}</span>
                  </div>)}
                </div>}
              </div>}
              {regRole==='alumni'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div><label style={s.label}>Grad Year</label><input style={s.input} placeholder="2018" value={regF.gradYear} onChange={e=>setRegF(f=>({...f,gradYear:e.target.value}))}/></div>
                <div><label style={s.label}>Sport Played</label><input style={s.input} placeholder="Football" value={regF.sportPlayed} onChange={e=>setRegF(f=>({...f,sportPlayed:e.target.value}))}/></div>
              </div>}
              {regErr&&<div style={{color:G.red,fontSize:13,marginBottom:12,background:G.redBg,padding:'8px 12px',borderRadius:6}}>{regErr}</div>}
              <Btn variant="primary" style={{width:'100%',marginTop:4}} onClick={doRegister} disabled={regLoading}>{regLoading?'Creating account...':'Create Account'}</Btn>
            </Card>
          )}
        </div>
      </div>
    </div>
  );

  // ── MAIN APP ──
  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div style={s.header}>
        <div style={s.headerInner}>
          <img src="https://image.maxpreps.io/school-mascot/2/c/a/2ca3712c-3b97-4458-9d65-3d773dad62ea.gif?version=637987468200000000&width=128&height=128&auto=webp&format=pjpg" style={s.mascot} alt="Vikings" onError={e=>e.target.style.display='none'}/>
          <div>
            <div style={s.schoolName}>Dr. L.G. Pinkston Sr. High School</div>
            <div style={s.teamName}>VIKINGS</div>
            <div style={s.tagline}>Athletics Program · Dallas, TX</div>
          </div>
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.08)',border:'0.5px solid rgba(255,255,255,0.15)',borderRadius:20,padding:'6px 12px'}}>
              <strong style={{fontSize:12,color:G.gold}}>{userProfile.name?.split(' ')[0]}</strong>
              <Badge role={userProfile.role}>{userProfile.role}</Badge>
            </div>
            <button onClick={doLogout} style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:'1px',textTransform:'uppercase',background:'transparent',border:'0.5px solid rgba(255,255,255,0.2)',color:'rgba(255,255,255,0.5)',padding:'5px 10px',borderRadius:6,cursor:'pointer'}}>Sign Out</button>
          </div>
        </div>
        <div style={s.goldBar}/>
      </div>

      <div style={s.nav}>
        {tabs.map((t,i)=>(
          <button key={t.id} style={s.navBtn(tab===t.id||(i===0&&!tabs.find(x=>x.id===tab)))} onClick={()=>setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {!userProfile.approved && (userProfile.role!=='fan'&&userProfile.role!=='alumni') && (
        <div style={{background:'#fef9c3',borderBottom:`1px solid rgba(133,77,14,0.3)`,padding:'12px 20px',fontSize:13,color:'#854d0e',textAlign:'center'}}>
          ⏳ Your account is pending approval. A coach or admin will review your request shortly.
        </div>
      )}

      <div style={s.content}>
        <AppContent
          user={userProfile}
          tab={tab}
          setTab={setTab}
          notify={notify}
          fdb={fdb}
          db={db}
          storage={storage}
          storageRef={ref}
          uploadBytes={uploadBytes}
          getDownloadURL={getDownloadURL}
          serverTimestamp={serverTimestamp}
          query={query}
          where={where}
          orderBy={orderBy}
          collection={collection}
          onSnapshot={onSnapshot}
          updateDoc={updateDoc}
          doc={doc}
          SPORTS={SPORTS}
          PHOTO_CATS={PHOTO_CATS}
          AUDIENCE_OPTS={AUDIENCE_OPTS}
          INJURY_TYPES={INJURY_TYPES}
          INJURY_STATUS={INJURY_STATUS}
          G={G}
          s={s}
        />
      </div>
      {toast&&<Toast msg={toast}/>}
    </div>
  );
}

// ─── PROFILE MODAL ────────────────────────────────────────────────────────────
// ─── PROFILE MODAL ────────────────────────────────────────────────────────────
// ─── APP CONTENT (receives all props) ────────────────────────────────────────
function AppContent({user, tab, setTab, notify, fdb, db, storage, storageRef, uploadBytes, getDownloadURL, serverTimestamp, query, where, orderBy, collection, onSnapshot, updateDoc, doc, SPORTS, PHOTO_CATS, AUDIENCE_OPTS, INJURY_TYPES, INJURY_STATUS, G, s}) {

  // ── SHARED STATE ──
  const [schedFilter, setSchedFilter] = useState('All');
  const [rosterFilter, setRosterFilter] = useState('All');
  const [photoCat, setPhotoCat] = useState('All');
  const [lbIdx, setLbIdx] = useState(null);
  const [attSport, setAttSport] = useState(SPORTS[0].key);
  const [attDate, setAttDate] = useState(new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}));
  const [activeThread, setActiveThread] = useState(null);
  const [msgInput, setMsgInput] = useState('');
  const chatRef = useRef(null);

  // ── FIRESTORE LIVE DATA ──
  const [schedules, setSchedules] = useState([]);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [playerStats, setPlayerStats] = useState([]);
  const [gameStats, setGameStats] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [messages, setMessages] = useState([]);
  const [injuries, setInjuries] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);

  // ── SUBSCRIBE TO FIRESTORE ──
  useEffect(()=>{
    const unsubs = [];
    const isParent = user.role==='parent';
    const isFanAlum = user.role==='fan'||user.role==='alumni';

    unsubs.push(fdb.listen('schedules',[orderBy('createdAt','desc')],setSchedules));
    unsubs.push(fdb.listen('events',[orderBy('createdAt','desc')],setEvents));
    unsubs.push(fdb.listen('announcements',[orderBy('createdAt','desc')],setAnnouncements));
    unsubs.push(fdb.listen('playerStats',[],setPlayerStats));
    unsubs.push(fdb.listen('gameStats',[orderBy('createdAt','desc')],setGameStats));
    unsubs.push(fdb.listen('photos',[where('approved','==',true)],setPhotos));

    // Parents only pull their own child's attendance
    if(isParent) {
      const childId = user.childId||null;
      const childName = user.childName||'';
      if(childId) {
        unsubs.push(fdb.listen('attendance',[where('athleteId','==',childId)],setAttendance));
      } else if(childName) {
        unsubs.push(fdb.listen('attendance',[where('athleteName','==',childName)],setAttendance));
      } else {
        setAttendance([]);
      }
      // Parents only pull their own notifications
      if(user.id) {
        unsubs.push(fdb.listen('notifications',[where('parentId','==',user.id),orderBy('createdAt','desc')],setNotifications));
      } else {
        setNotifications([]);
      }
    } else {
      // Coaches, admin pull all attendance
      unsubs.push(fdb.listen('attendance',[],setAttendance));
      unsubs.push(fdb.listen('notifications',[orderBy('createdAt','desc')],setNotifications));
    }

    // Only coaches and admin see pending photos, injuries, broadcasts, reminders, all users
    if(!isFanAlum) {
      unsubs.push(fdb.listen('users',[where('approved','==',true)],setUsers));
    }
    if(user.role==='admin'||user.role==='coach') {
      unsubs.push(fdb.listen('photos',[where('approved','==',false)],setPendingPhotos));
      unsubs.push(fdb.listen('injuries',[orderBy('createdAt','desc')],setInjuries));
      unsubs.push(fdb.listen('broadcasts',[orderBy('createdAt','desc')],setBroadcasts));
      unsubs.push(fdb.listen('reminders',[orderBy('createdAt','desc')],setReminders));
      unsubs.push(fdb.listen('users',[where('approved','==',false)],setPendingUsers));
    }

    if(activeThread) {
      unsubs.push(fdb.listen(`threads/${activeThread}/messages`,[orderBy('createdAt','asc')],setMessages));
    }
    return ()=>unsubs.forEach(u=>u&&u());
  },[activeThread]);

  useEffect(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},[messages]);

  // ── ACTIONS ──
  const addSchedule = async (data) => { await fdb.add('schedules',{...data,createdBy:user.id,sport:user.sport||data.sport}); notify('Game added!'); };
  const addEvent = async (data) => { await fdb.add('events',{...data,createdBy:user.id,createdByName:user.name}); notify(`${data.eventType} added to calendar!`); };
  const addAnnouncement = async (data) => { await fdb.add('announcements',{...data,coach:user.name,coachId:user.id}); notify('Announcement posted!'); };

  const markAttendance = async (athleteId, athleteName, athleteSport, status) => {
    const existing = attendance.find(a=>a.athleteId===athleteId&&a.date===attDate&&a.sport===attSport);
    if(existing) {
      await updateDoc(doc(db,'attendance',existing.id),{status});
    } else {
      await fdb.add('attendance',{athleteId,athleteName,sport:attSport,date:attDate,status,markedBy:user.id,markedByName:user.name});
    }
    if(status==='absent'||status==='tardy') {
      const parent = users.find(u=>u.role==='parent'&&(u.childId===athleteId||u.childName===athleteName));
      if(parent) {
        const already = notifications.find(n=>n.athleteName===athleteName&&n.date===attDate&&n.type===status);
        if(!already) {
          await fdb.add('notifications',{parentId:parent.id,parentName:parent.name,athleteId,athleteName,type:status,sport:attSport,date:attDate,sent:true,channel:'Email + SMS',message:`${athleteName} was marked ${status} at ${attSport} on ${attDate}.`});
        }
      }
      notify(status==='absent'?'Marked absent — 📧 Email + SMS sent':'Marked tardy — 📧 Email + SMS sent');
    } else {
      notify('Marked present ✓');
    }
  };

  const sendMessage = async (threadId, receiverId) => {
    if(!msgInput.trim()) return;
    await fdb.add(`threads/${threadId}/messages`,{senderId:user.id,senderName:user.name,receiverId,text:msgInput.trim()});
    setMsgInput('');
  };

  const approveUser = async (uid) => { await updateDoc(doc(db,'users',uid),{approved:true}); notify('User approved!'); };
  const rejectUser = async (uid) => { await fdb.delete('users',uid); notify('User declined.'); };
  const deleteUser = async (uid, name) => { await fdb.delete('users', uid); notify(`${name}'s account has been deleted.`); };
  const approvePhoto = async (photoId) => { await updateDoc(doc(db,'photos',photoId),{approved:true}); notify('Photo approved!'); };
  const rejectPhoto = async (photoId) => { await fdb.delete('photos',photoId); notify('Photo declined.'); };

  const uploadPhoto = async (title, cat, sport, file) => {
    if(!title){notify('Please add a title.');return;}
    let url = null;
    if(file) {
      const r = storageRef(storage,`photos/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      url = await getDownloadURL(r);
    }
    await fdb.add('photos',{title,category:cat,cat,sport,storageUrl:url||'',src:url||`https://via.placeholder.com/400x400/0a1628/c9961a?text=${encodeURIComponent(title)}`,uploader:user.name,uploaderId:user.id,uploadDate:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),approved:false,likes:0});
    notify('Submitted for review!');
  };

  const addInjury = async (data) => { await fdb.add('injuries',{...data,coachId:user.id,coach:user.name,private:true}); notify('Health record saved.'); };
  const sendBroadcast = async (sport, title, message) => {
    const athletes = users.filter(u=>u.role==='athlete'&&u.sport===sport);
    const parents = users.filter(u=>u.role==='parent'&&athletes.some(a=>a.name===u.childName));
    const count = athletes.length+parents.length;
    await fdb.add('broadcasts',{sport,title,message,sentBy:user.name,sentById:user.id,recipients:`All ${sport} Athletes & Parents`,recipientCount:count});
    notify(`📢 Broadcast sent to ${count} people!`);
  };
  const scheduleReminder = async (data) => { await fdb.add('reminders',{...data,sentBy:user.name,sentById:user.id,sent:false}); notify('⏰ Reminder scheduled!'); };
  const updateLiveScore = async (gameId, us, them, quarter) => { await updateDoc(doc(db,'schedules',gameId),{liveScore:{us,them,quarter,live:true}}); notify('Score updated!'); };

  // ── FILTERED DATA ──
  const visiblePhotos = photoCat==='All' ? photos : photos.filter(p=>(p.cat||p.category)===photoCat);
  const myAnnouncements = announcements.filter(ann=>{
    if(!ann.audience||ann.audience.includes('all')) return true;
    const r = user.role;
    if(r==='athlete'||r==='parent') return ann.audience.includes('athletes_parents');
    if(r==='coach'||r==='admin') return true;
    if(r==='fan'||r==='alumni') return ann.audience.includes('fans_alumni');
    return false;
  });
  const athletes = users.filter(u=>u.role==='athlete');
  const myTeamAthletes = athletes.filter(u=>u.sport===user.sport);
  const myAttendance = attendance.filter(a=>a.athleteId===user.id);
  const myNotifications = user.role==='parent' ? notifications.filter(n=>n.parentId===user.id||(user.childId&&n.athleteId===user.childId)||(user.childName&&n.athleteName===user.childName)) : notifications.filter(n=>n.parentId===user.id||n.parentName===user.name);
  const liveGames = schedules.filter(g=>g.liveScore?.live);

  // ── RENDER ──
  const renderTab = () => {
    switch(tab) {
      case 'dashboard': return <DashboardTab/>;
      case 'photos': return <PhotoTab/>;
      case 'schedule': return <ScheduleTab/>;
      case 'calendar': return <CalendarTab/>;
      case 'my-sports': return <MySportsTab/>;
      case 'my-team': return <MyTeamTab/>;
      case 'announcements': return <AnnouncementsTab/>;
      case 'roster': return <RosterTab/>;
      case 'attendance': return <AttendanceTab/>;
      case 'health': return <HealthTab/>;
      case 'broadcast': return <BroadcastTab/>;
      case 'reminders': return <RemindersTab/>;
      case 'community': return <CommunityTab/>;
      case 'stats': return <StatsTab/>;
      case 'messages': return <MessagesTab/>;
      case 'approvals': return <ApprovalsTab/>;
      case 'notifications': return <NotificationsTab/>;
      case 'profile': return <ProfileTab/>;
      default: return <DashboardTab/>;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────
  function DashboardTab() {
    const r = user.role;
    const myGames = schedules.filter(s=>s.sport===user.sport).slice(0,3);
    const activeInjuries = injuries.filter(i=>i.sport===user.sport&&i.status!=='Cleared');

    if(r==='admin') return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>Admin Dashboard</span></div>
      <StatGrid stats={[{num:users.length,lbl:'Users'},{num:athletes.length,lbl:'Athletes'},{num:pendingUsers.length+pendingPhotos.length,lbl:'Pending',color:pendingUsers.length+pendingPhotos.length>0?G.red:G.green}]}/>
      <Card><CardTitle>Quick Actions</CardTitle><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Btn variant="primary" sm onClick={()=>setTab('approvals')}>Approvals ({pendingUsers.length+pendingPhotos.length})</Btn><Btn variant="outline" sm onClick={()=>setTab('broadcast')}>Broadcast</Btn><Btn variant="outline" sm onClick={()=>setTab('health')}>Health Log</Btn></div></Card>
      <Card><CardTitle>Recent Notifications</CardTitle>{notifications.slice(0,4).map(n=><NotifRow key={n.id} n={n}/>)||<Empty/>}</Card>
    </div>;

    if(r==='coach') return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Coach Dashboard</span><span style={s.pageSub}>{user.sport}</span></div></div>
      <StatGrid stats={[{num:myTeamAthletes.length,lbl:'Athletes'},{num:activeInjuries.length,lbl:'Active Injuries',color:activeInjuries.length>0?G.red:G.green},{num:myGames.length,lbl:'Games'}]}/>
      {activeInjuries.length>0&&<Card style={{borderLeft:`3px solid ${G.red}`}}><CardTitle>⚠️ Active Injuries</CardTitle>{activeInjuries.map(i=><div key={i.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`0.5px solid ${G.off}`}}><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{i.athleteName}</div><div style={{fontSize:12,color:G.muted}}>{i.type} · {i.location}</div></div><Badge role={i.status}>{i.status}</Badge></div>)}</Card>}
      <Card><CardTitle>Upcoming Games</CardTitle>{myGames.length?myGames.map(g=><GameItem key={g.id} g={g}/>):<Empty msg="No games scheduled yet."/>}</Card>
      <Card><CardTitle>Quick Actions</CardTitle><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Btn variant="gold" sm onClick={()=>setTab('broadcast')}>Broadcast</Btn><Btn variant="outline" sm onClick={()=>setTab('health')}>Health Log</Btn><Btn variant="outline" sm onClick={()=>setTab('attendance')}>Attendance</Btn></div></Card>
    </div>;

    if(r==='athlete') return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>My Dashboard</span><span style={s.pageSub}>{user.sport||'No team yet'}</span></div></div>
      <StatGrid stats={[{num:myAttendance.length,lbl:'Sessions'},{num:myAttendance.filter(a=>a.status==='absent').length,lbl:'Absences',color:G.red},{num:myAttendance.filter(a=>a.status==='tardy').length,lbl:'Tardies',color:G.gold}]}/>
      {user.sport&&<Card><CardTitle>Upcoming — {user.sport}</CardTitle>{myGames.length?myGames.map(g=><GameItem key={g.id} g={g}/>):<Empty msg="No upcoming games."/>}</Card>}
      <Card><CardTitle>Announcements</CardTitle>{myAnnouncements.slice(0,3).map(a=><AnnItem key={a.id} ann={a}/>)||<Empty/>}</Card>
    </div>;

    if(r==='parent') {
      const childAtt = attendance.filter(a=>a.athleteName===user.childName);
      return <div>
        <div style={s.pageHeader}><div><span style={s.pageTitle}>Parent Dashboard</span><span style={s.pageSub}>{user.childName}</span></div></div>
        <StatGrid stats={[{num:childAtt.length,lbl:'Sessions'},{num:childAtt.filter(a=>a.status==='absent').length,lbl:'Absences',color:G.red},{num:childAtt.filter(a=>a.status==='tardy').length,lbl:'Tardies',color:G.gold}]}/>
        <Card><CardTitle>Recent Notifications</CardTitle>{myNotifications.length?myNotifications.slice(0,4).map(n=><NotifRow key={n.id} n={n}/>):<Empty msg="No notifications yet."/>}</Card>
      </div>;
    }

    // Fan / Alumni
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Vikings {r==='alumni'?'Alumni':'Fan'} Hub</span></div></div>
      <StatGrid stats={[{num:SPORTS.length,lbl:'Programs'},{num:schedules.filter(g=>g.badge==='win').length,lbl:'Wins'},{num:liveGames.length,lbl:'Live Now',color:liveGames.length>0?G.red:G.muted}]}/>
      {liveGames.length>0&&<Card style={{border:`1.5px solid ${G.red}`}}><CardTitle>🔴 Live Now</CardTitle>{liveGames.map(g=><GameItem key={g.id} g={g} showLive/>)}</Card>}
      <Card><CardTitle>Upcoming Games</CardTitle>{schedules.slice(0,5).map(g=><GameItem key={g.id} g={g}/>)||<Empty/>}</Card>
    </div>;
  }

  function NotifRow({n}) {
    const icons={absent:'🔴',tardy:'🟡',reminder:'🔔',broadcast:'📢'};
    return <div style={{display:'flex',gap:10,padding:'8px 0',borderBottom:`0.5px solid ${G.off}`,fontSize:13}}>
      <span style={{fontSize:16,flexShrink:0}}>{icons[n.type]||'📩'}</span>
      <div style={{flex:1}}>
        <div style={{fontWeight:600,color:G.black}}>{n.athleteName||n.message?.slice(0,50)||'Notification'}</div>
        <div style={{fontSize:12,color:G.muted}}>{n.type} · {n.sport} · {n.date}</div>
        {n.channel&&<div style={{fontSize:11,color:G.muted}}>📧 {n.channel}</div>}
      </div>
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCHEDULE
  // ─────────────────────────────────────────────────────────────────────────
  function ScheduleTab() {
    const [modal, setModal] = useState(false);
    const [gf, setGf] = useState({month:'',day:'',opponent:'',details:'',badge:'home'});
    const pills = ['All',...SPORTS.map(s=>s.key)];
    const items = schedFilter==='All'?schedules:schedules.filter(g=>g.sport===schedFilter);
    const save = async () => {
      if(!gf.opponent||!gf.month||!gf.day) return;
      await addSchedule(gf);
      setGf({month:'',day:'',opponent:'',details:'',badge:'home'});
      setModal(false);
    };
    return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>Schedule</span>{user.role==='coach'&&<Btn variant="gold" sm onClick={()=>setModal(true)}>+ Add Game</Btn>}</div>
      <FilterBar cats={pills} active={schedFilter} onChange={setSchedFilter}/>
      <Card>{items.length?items.map(g=><GameItem key={g.id} g={g} showLive/>):<Empty msg="No games scheduled yet."/>}</Card>
      {modal&&<Modal title="Add Game" onClose={()=>setModal(false)}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div><label style={s.label}>Month</label><select style={s.input} value={gf.month} onChange={e=>setGf(x=>({...x,month:e.target.value}))}><option value="">Month...</option>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m=><option key={m} value={m}>{m}</option>)}</select></div>
          <div><label style={s.label}>Day</label><select style={s.input} value={gf.day} onChange={e=>setGf(x=>({...x,day:e.target.value}))}><option value="">Day...</option>{Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}</select></div>
        </div>
        <div style={{marginBottom:12}}><label style={s.label}>Opponent</label><input style={s.input} placeholder="vs. Lincoln HS" value={gf.opponent} onChange={e=>setGf(x=>({...x,opponent:e.target.value}))}/></div>
        <div style={{marginBottom:12}}><label style={s.label}>Details / Location</label><LocationInput value={gf.details} onChange={v=>setGf(x=>({...x,details:v}))} placeholder="7:00 PM · Main Gym..."/></div>
        <div style={{marginBottom:16}}><label style={s.label}>Type</label><select style={s.input} value={gf.badge} onChange={e=>setGf(x=>({...x,badge:e.target.value}))}><option value="home">Home</option><option value="away">Away</option></select></div>
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={save}>Add</Btn><Btn variant="outline" onClick={()=>setModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MY SPORTS
  // ─────────────────────────────────────────────────────────────────────────
  function MySportsTab() {
    const join = async (sport) => {
      if(user.sport===sport){notify('Already on this team.');return;}
      await updateDoc(doc(db,'users',user.id),{sport});
      notify(`Request sent to ${sport} coach!`);
    };
    return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>My Sports</span></div>
      <Card style={{marginBottom:12}}><div style={{fontSize:13,color:G.muted}}>Select your sport to request joining. Your coach must approve before you appear on the roster.</div></Card>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(108px,1fr))',gap:10}}>
        {SPORTS.map(sp=>{
          const joined=user.sport===sp.key;
          return <div key={sp.key} onClick={()=>join(sp.key)} style={{background:joined?G.goldPale:G.white,borderRadius:10,border:`0.5px solid ${joined?G.gold:'rgba(0,0,0,0.08)'}`,padding:'14px 10px 12px',textAlign:'center',cursor:'pointer'}}>
            <div style={{fontSize:22,marginBottom:6}}>{sp.icon}</div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,fontWeight:500,letterSpacing:'0.8px',textTransform:'uppercase',color:G.black}}>{sp.key}</div>
            <div style={{fontSize:11,color:G.muted,marginTop:3}}>{joined?<Badge role="approved">Joined</Badge>:'Join'}</div>
          </div>;
        })}
      </div>
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MY TEAM
  // ─────────────────────────────────────────────────────────────────────────
  function MyTeamTab() {
    const sport = user.sport||'Football';
    const teamAthletes = athletes.filter(u=>u.sport===sport);
    const pending = pendingUsers.filter(u=>u.role==='athlete'&&u.sport===sport);
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>My Team</span><span style={s.pageSub}>{sport}</span></div></div>
      {pending.length>0&&<Card><CardTitle>Pending Approvals ({pending.length})</CardTitle>{pending.map(u=><div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:`0.5px solid ${G.off}`}}>
        <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{u.name}</div><div style={{fontSize:12,color:G.muted}}>#{u.jersey||'—'} · Grade {u.grade||'—'}</div></div>
        <div style={{display:'flex',gap:6}}><Btn variant="gold" sm onClick={()=>approveUser(u.id)}>Approve</Btn><Btn variant="danger" sm onClick={()=>rejectUser(u.id)}>Decline</Btn></div>
      </div>)}</Card>}
      <Card><CardTitle>Roster — {teamAthletes.length} Athletes</CardTitle>
        {teamAthletes.length?<table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr>{['#','Name','Grade','Phone'].map(h=><th key={h} style={{fontFamily:"'Oswald',sans-serif",fontSize:11,fontWeight:500,letterSpacing:'1px',textTransform:'uppercase',color:G.muted,textAlign:'left',padding:'8px 10px',borderBottom:`1px solid ${G.off}`}}>{h}</th>)}</tr></thead>
          <tbody>{teamAthletes.map(a=><tr key={a.id}><td style={{padding:'10px'}}><span style={{display:'inline-block',background:G.black,color:G.gold,fontFamily:"'Oswald',sans-serif",fontSize:12,fontWeight:700,width:28,height:28,borderRadius:'50%',textAlign:'center',lineHeight:'28px'}}>{a.jersey||'—'}</span></td><td style={{padding:'10px',fontWeight:500}}>{a.name}</td><td style={{padding:'10px',color:G.muted}}>{a.grade||'—'}</td><td style={{padding:'10px',fontSize:12,color:G.muted}}>{a.phone||'—'}</td></tr>)}</tbody>
        </table>:<Empty msg="No athletes on this team yet."/>}
      </Card>
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANNOUNCEMENTS
  // ─────────────────────────────────────────────────────────────────────────
  function AnnouncementsTab() {
    const [modal, setModal] = useState(false);
    const [af, setAf] = useState({title:'',body:'',audience:['all']});
    const sport = user.sport||'Football';
    const myAnns = announcements.filter(a=>a.sport===sport||a.sport==='ALL');
    const toggleAud = v => setAf(f=>({...f,audience:f.audience.includes(v)?f.audience.filter(x=>x!==v):[...f.audience,v]}));
    const save = async () => {
      if(!af.title) return;
      await addAnnouncement({...af,sport:user.sport||'ALL',date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})});
      setAf({title:'',body:'',audience:['all']});setModal(false);
    };
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Announcements</span><span style={s.pageSub}>{sport}</span></div><Btn variant="gold" sm onClick={()=>setModal(true)}>+ New Post</Btn></div>
      <Card>{myAnns.length?myAnns.map(a=><AnnItem key={a.id} ann={a}/>):<Empty msg="No announcements yet."/>}</Card>
      {modal&&<Modal title="New Announcement" onClose={()=>setModal(false)}>
        <div style={{marginBottom:12}}><label style={s.label}>Title</label><input style={s.input} value={af.title} onChange={e=>setAf(f=>({...f,title:e.target.value}))} placeholder="e.g. Practice Cancelled"/></div>
        <div style={{marginBottom:12}}><label style={s.label}>Message</label><textarea style={{...s.input,minHeight:80,resize:'vertical'}} value={af.body} onChange={e=>setAf(f=>({...f,body:e.target.value}))} placeholder="Details..."/></div>
        <div style={{marginBottom:16}}><label style={s.label}>Share With</label><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{AUDIENCE_OPTS.map(o=><label key={o.val} style={{display:'flex',alignItems:'center',gap:5,fontSize:13,cursor:'pointer'}}><input type="checkbox" checked={af.audience.includes(o.val)} onChange={()=>toggleAud(o.val)} style={{accentColor:G.gold}}/> {o.label}</label>)}</div></div>
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={save}>Post</Btn><Btn variant="outline" onClick={()=>setModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ROSTER
  // ─────────────────────────────────────────────────────────────────────────
  function RosterTab() {
    const [confirmDelete, setConfirmDelete] = useState(null); // {id, name}
    const filtered = athletes.filter(a=>rosterFilter==='All'||a.sport===rosterFilter);
    const isAdmin = user.role==='admin';
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Roster</span><span style={s.pageSub}>{athletes.length} athletes</span></div></div>
      <FilterBar cats={['All',...SPORTS.map(s=>s.key)]} active={rosterFilter} onChange={setRosterFilter}/>
      <Card>
        {filtered.length?<table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr>{['#','Name','Sport','Grade',isAdmin?'Action':''].map(h=><th key={h} style={{fontFamily:"'Oswald',sans-serif",fontSize:11,fontWeight:500,letterSpacing:'1px',textTransform:'uppercase',color:G.muted,textAlign:'left',padding:'8px 10px',borderBottom:`1px solid ${G.off}`}}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(a=><tr key={a.id}>
            <td style={{padding:'10px'}}><span style={{display:'inline-block',background:G.black,color:G.gold,fontFamily:"'Oswald',sans-serif",fontSize:12,fontWeight:700,width:28,height:28,borderRadius:'50%',textAlign:'center',lineHeight:'28px'}}>{a.jersey||'—'}</span></td>
            <td style={{padding:'10px',fontWeight:500}}>{a.name}</td>
            <td style={{padding:'10px',fontSize:12,color:G.muted}}>{a.sport||'—'}</td>
            <td style={{padding:'10px'}}>{a.grade||'—'}</td>
            {isAdmin&&<td style={{padding:'10px'}}><Btn variant="danger" sm onClick={()=>setConfirmDelete({id:a.id,name:a.name})}>Delete</Btn></td>}
          </tr>)}</tbody>
        </table>:<Empty msg="No athletes found."/>}
      </Card>
      {confirmDelete&&<Modal title="Delete Account" onClose={()=>setConfirmDelete(null)}>
        <div style={{fontSize:14,color:G.black,lineHeight:1.6,marginBottom:16}}>
          Are you sure you want to delete <strong>{confirmDelete.name}</strong>'s account?
          <div style={{marginTop:8,fontSize:13,color:G.red,background:G.redBg,padding:'10px 12px',borderRadius:6,lineHeight:1.6}}>
            ⚠️ This will permanently remove their profile from the app. This cannot be undone. Their attendance records and other data will remain for historical purposes.
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn variant="danger" onClick={()=>{deleteUser(confirmDelete.id,confirmDelete.name);setConfirmDelete(null);}}>Yes, Delete Account</Btn>
          <Btn variant="outline" onClick={()=>setConfirmDelete(null)}>Cancel</Btn>
        </div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ATTENDANCE
  // ─────────────────────────────────────────────────────────────────────────
  function AttendanceTab() {
    const canEdit = user.role==='admin'||user.role==='coach';
    const isParent = user.role==='parent';
    const sportList = user.role==='coach'&&user.sport?[user.sport]:SPORTS.map(s=>s.key);
    const teamAthletes = athletes.filter(u=>u.sport===attSport);

    // Parents only see their own child's records
    const childId = user.childId||null;
    const childName = user.childName||'';
    const myChildAtt = attendance.filter(a=>a.athleteId===childId||a.athleteName===childName);

    // Admin/coach see all; parent sees only their child
    const logToShow = isParent ? myChildAtt : attendance;

    if(isParent) return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>Attendance</span><span style={s.pageSub}>{childName}</span></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[{n:myChildAtt.filter(a=>a.status==='present').length,l:'Present',c:G.green},{n:myChildAtt.filter(a=>a.status==='absent').length,l:'Absences',c:G.red},{n:myChildAtt.filter(a=>a.status==='tardy').length,l:'Tardies',c:G.gold}].map(({n,l,c})=><div key={l} style={s.statBlock}><div style={{...s.statNum,color:c}}>{n}</div><div style={s.statLbl}>{l}</div></div>)}
      </div>
      <Card>
        <CardTitle>{childName}'s Attendance Record</CardTitle>
        {myChildAtt.length?myChildAtt.map(a=><div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`0.5px solid ${G.off}`,fontSize:13}}>
          <div style={{flex:1,fontWeight:500}}>{a.sport}</div>
          <div style={{fontSize:12,color:G.muted}}>{a.date}</div>
          <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:a.status==='present'?G.greenBg:a.status==='absent'?G.redBg:'#fef9c3',color:a.status==='present'?G.green:a.status==='absent'?G.red:'#854d0e'}}>{a.status}</span>
        </div>):<Empty msg="No attendance records yet."/>}
      </Card>
    </div>;

    return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>Attendance</span></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[{n:attendance.filter(a=>a.status==='present').length,l:'Present',c:G.green},{n:attendance.filter(a=>a.status==='absent').length,l:'Absences',c:G.red},{n:attendance.filter(a=>a.status==='tardy').length,l:'Tardies',c:G.gold}].map(({n,l,c})=><div key={l} style={s.statBlock}><div style={{...s.statNum,color:c}}>{n}</div><div style={s.statLbl}>{l}</div></div>)}
      </div>
      <Card style={{background:'#f0fdf4',border:`0.5px solid rgba(26,102,54,0.2)`}}><div style={{fontSize:13,color:G.green,lineHeight:1.6}}>⚡ <strong>Instant notifications:</strong> Parents receive Email + SMS the moment a student is marked absent or tardy.</div></Card>
      {canEdit&&<Card><CardTitle>Take Attendance</CardTitle>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div><label style={s.label}>Sport</label><select style={s.input} value={attSport} onChange={e=>setAttSport(e.target.value)}>{sportList.map(sp=><option key={sp} value={sp}>{sp}</option>)}</select></div>
          <div><label style={s.label}>Date</label><input style={s.input} value={attDate} onChange={e=>setAttDate(e.target.value)}/></div>
        </div>
        {teamAthletes.length===0?<Empty msg="No athletes on this team yet."/>:
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,padding:'6px 0',borderBottom:`1px solid ${G.off}`,fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:'1px',textTransform:'uppercase',color:G.muted}}>
              <div>Athlete</div><div>P / A / T</div>
            </div>
            {teamAthletes.map(a=>{
              const ex = attendance.find(r=>r.athleteId===a.id&&r.date===attDate&&r.sport===attSport);
              const st = ex?ex.status:'';
              const ab=(status,label,bg,activeBg)=><button onClick={()=>markAttendance(a.id,a.name,a.sport,status)} style={{fontFamily:"'Oswald',sans-serif",fontSize:10,letterSpacing:'0.8px',padding:'4px 8px',borderRadius:5,cursor:'pointer',border:`0.5px solid transparent`,background:st===status?activeBg:bg,color:st===status?'#fff':{present:G.green,absent:G.red,tardy:'#854d0e'}[status],fontWeight:st===status?700:400}}>{label}</button>;
              return <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`0.5px solid ${G.off}`}}>
                <div style={{fontWeight:500,fontSize:13}}>{a.name} <span style={{fontSize:11,color:G.muted}}>#{a.jersey||'—'}</span></div>
                <div style={{display:'flex',gap:5}}>{ab('present','P',G.greenBg,G.green)}{ab('absent','A',G.redBg,G.red)}{ab('tardy','T','#fef9c3','#b45309')}</div>
              </div>;
            })}
          </div>}
      </Card>}
      <Card><CardTitle>Recent Log</CardTitle>
        {logToShow.slice(0,8).map(a=><div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`0.5px solid ${G.off}`,fontSize:13}}>
          <div style={{flex:1,fontWeight:500}}>{a.athleteName}</div>
          <div style={{fontSize:12,color:G.muted}}>{a.sport}</div>
          <div style={{fontSize:12,color:G.muted}}>{a.date}</div>
          <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:a.status==='present'?G.greenBg:a.status==='absent'?G.redBg:'#fef9c3',color:a.status==='present'?G.green:a.status==='absent'?G.red:'#854d0e'}}>{a.status}</span>
        </div>)}
      </Card>
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTH LOG
  // ─────────────────────────────────────────────────────────────────────────
  function HealthTab() {
    const [modal, setModal] = useState(false);
    const [f, setF] = useState({athleteId:'',type:'Sprain',location:'',status:'Active',notes:''});
    const [filter, setFilter] = useState('All');
    const sport = user.role==='coach'?user.sport:null;
    const myInjuries = sport?injuries.filter(i=>i.sport===sport):injuries;
    const filtered = filter==='All'?myInjuries:myInjuries.filter(i=>i.status===filter);
    const teamAthletes = sport?athletes.filter(u=>u.sport===sport):athletes;
    const statusColor = {Active:G.red,Recovering:G.orange,Cleared:G.green};
    const save = async () => {
      const athlete = teamAthletes.find(u=>u.id===f.athleteId);
      if(!athlete){notify('Select an athlete.');return;}
      await addInjury({...f,athleteName:athlete.name,sport:athlete.sport||sport,date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})});
      setF({athleteId:'',type:'Sprain',location:'',status:'Active',notes:''});
      setModal(false);
    };
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Health Log</span><span style={s.pageSub}>Private · Coaches & Admin only</span></div><Btn variant="gold" sm onClick={()=>setModal(true)}>+ New Record</Btn></div>
      <Card style={{background:'#fef9c3',border:`0.5px solid rgba(133,77,14,0.3)`}}><div style={{fontSize:13,color:'#854d0e',lineHeight:1.6}}>🔒 <strong>Private.</strong> Only visible to coaches and admin. Never shown to athletes, parents, fans, or alumni.</div></Card>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {['Active','Recovering','Cleared'].map(st=><div key={st} style={s.statBlock}><div style={{...s.statNum,color:statusColor[st]}}>{myInjuries.filter(i=>i.status===st).length}</div><div style={s.statLbl}>{st}</div></div>)}
      </div>
      <FilterBar cats={['All','Active','Recovering','Cleared']} active={filter} onChange={setFilter}/>
      <Card>
        {filtered.length?filtered.map(inj=><div key={inj.id} style={{padding:'14px 0',borderBottom:`0.5px solid ${G.off}`}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6}}>
            <div><span style={{fontWeight:600,fontSize:14,color:G.black}}>{inj.athleteName}</span><span style={{fontSize:12,color:G.muted,marginLeft:8}}>{inj.sport}</span></div>
            <span style={{fontFamily:"'Oswald',sans-serif",fontSize:11,padding:'2px 8px',borderRadius:4,background:inj.status==='Active'?G.redBg:inj.status==='Recovering'?G.orangeBg:G.greenBg,color:statusColor[inj.status]}}>{inj.status}</span>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:6,flexWrap:'wrap'}}>
            <span style={{fontSize:12,fontWeight:600,color:G.black}}>{inj.type}</span>
            <span style={{fontSize:12,color:G.muted}}>· {inj.location} · {inj.date}</span>
          </div>
          <div style={{fontSize:13,color:'#555',lineHeight:1.5,background:G.off,borderRadius:6,padding:'8px 10px'}}>{inj.notes}</div>
          <div style={{fontSize:11,color:G.muted,marginTop:4}}>Logged by {inj.coach}</div>
        </div>):<Empty msg="No records found."/>}
      </Card>
      {modal&&<Modal title="New Health Record" onClose={()=>setModal(false)}>
        <div style={{marginBottom:12}}><label style={s.label}>Athlete</label><select style={s.input} value={f.athleteId} onChange={e=>setF(x=>({...x,athleteId:e.target.value}))}><option value="">Select athlete...</option>{teamAthletes.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div><label style={s.label}>Type</label><select style={s.input} value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value}))}>{INJURY_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label style={s.label}>Status</label><select style={s.input} value={f.status} onChange={e=>setF(x=>({...x,status:e.target.value}))}>{INJURY_STATUS.map(t=><option key={t}>{t}</option>)}</select></div>
        </div>
        <div style={{marginBottom:12}}><label style={s.label}>Body Part / Location</label><input style={s.input} placeholder="e.g. Left ankle" value={f.location} onChange={e=>setF(x=>({...x,location:e.target.value}))}/></div>
        <div style={{marginBottom:16}}><label style={s.label}>Notes (private)</label><textarea style={{...s.input,minHeight:90,resize:'vertical'}} placeholder="Injury details, treatment plan, restrictions..." value={f.notes} onChange={e=>setF(x=>({...x,notes:e.target.value}))}/></div>
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={save}>Save Record</Btn><Btn variant="outline" onClick={()=>setModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BROADCAST
  // ─────────────────────────────────────────────────────────────────────────
  function BroadcastTab() {
    const [modal, setModal] = useState(false);
    const [f, setF] = useState({sport:'',title:'',message:''});
    const coachSport = user.role==='coach'?user.sport:null;
    const sportList = coachSport?[coachSport]:SPORTS.map(s=>s.key);
    const myBroadcasts = coachSport?broadcasts.filter(b=>b.sport===coachSport):broadcasts;
    const send = async () => {
      if(!f.title||!f.message||!f.sport){notify('Fill in all fields.');return;}
      await sendBroadcast(f.sport,f.title,f.message);
      setF({sport:'',title:'',message:''});setModal(false);
    };
    const recipientCount = f.sport ? athletes.filter(u=>u.sport===f.sport).length + users.filter(u=>u.role==='parent'&&athletes.some(a=>a.sport===f.sport&&a.name===u.childName)).length : 0;
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Mass Broadcast</span></div><Btn variant="gold" sm onClick={()=>setModal(true)}>+ New Broadcast</Btn></div>
      <Card style={{background:G.blueBg,border:`0.5px solid rgba(30,64,175,0.2)`}}><div style={{fontSize:13,color:G.blue,lineHeight:1.6}}>📢 Broadcasts reach <strong>every athlete and parent</strong> on a team simultaneously via Email + SMS.</div></Card>
      {myBroadcasts.length?myBroadcasts.map(b=><Card key={b.id}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
          <div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,fontWeight:600,color:G.black}}>{b.title}</div><div style={{fontSize:12,color:G.muted,marginTop:2}}>{b.sport} · By {b.sentBy}</div></div>
          <span style={{fontFamily:"'Oswald',sans-serif",fontSize:11,background:G.greenBg,color:G.green,padding:'2px 8px',borderRadius:4,whiteSpace:'nowrap'}}>Sent to {b.recipientCount}</span>
        </div>
        <div style={{fontSize:13,color:'#555',lineHeight:1.5,background:G.off,borderRadius:6,padding:'10px 12px'}}>{b.message}</div>
      </Card>):<Card><Empty msg="No broadcasts sent yet."/></Card>}
      {modal&&<Modal title="New Broadcast" onClose={()=>setModal(false)}>
        <div style={{marginBottom:12}}><label style={s.label}>Team</label><select style={s.input} value={f.sport} onChange={e=>setF(x=>({...x,sport:e.target.value}))}><option value="">Select team...</option>{sportList.map(sp=><option key={sp} value={sp}>{sp}</option>)}</select></div>
        <div style={{marginBottom:12}}><label style={s.label}>Subject</label><input style={s.input} placeholder="e.g. Practice Cancelled" value={f.title} onChange={e=>setF(x=>({...x,title:e.target.value}))}/></div>
        <div style={{marginBottom:12}}><label style={s.label}>Message</label><textarea style={{...s.input,minHeight:100,resize:'vertical'}} placeholder="Your message..." value={f.message} onChange={e=>setF(x=>({...x,message:e.target.value}))}/></div>
        {f.sport&&<div style={{fontSize:13,color:G.blue,background:G.blueBg,padding:'8px 10px',borderRadius:6,marginBottom:14}}>Will send to <strong>{recipientCount} people</strong> via Email + SMS.</div>}
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={send}>Send Now</Btn><Btn variant="outline" onClick={()=>setModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REMINDERS
  // ─────────────────────────────────────────────────────────────────────────
  function RemindersTab() {
    const [modal, setModal] = useState(false);
    const [f, setF] = useState({type:'game',sport:'',message:'',date:'',time:'6:00 PM'});
    const coachSport = user.role==='coach'?user.sport:null;
    const sportList = coachSport?[coachSport]:SPORTS.map(s=>s.key);
    const myReminders = coachSport?reminders.filter(r=>r.sport===coachSport):reminders;
    const typeIcons = {game:'🏟️',practice:'🏃',announcement:'📣'};
    const save = async () => {
      if(!f.sport||!f.message||!f.date){notify('Fill in all fields.');return;}
      await scheduleReminder({...f});
      setF({type:'game',sport:'',message:'',date:'',time:'6:00 PM'});setModal(false);
    };
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Reminders</span></div><Btn variant="gold" sm onClick={()=>setModal(true)}>+ Schedule</Btn></div>
      <Card style={{background:G.goldPale,border:`0.5px solid rgba(201,150,26,0.3)`}}><div style={{fontSize:13,color:'#7A5200',lineHeight:1.6}}>⏰ Schedule reminders that automatically send to athletes & parents before games or practices.</div></Card>
      {myReminders.length?myReminders.map(r=><div key={r.id} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:`0.5px solid ${G.off}`,alignItems:'flex-start'}}>
        <span style={{fontSize:20,flexShrink:0}}>{typeIcons[r.type]||'🔔'}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,fontSize:13,color:G.black}}>{r.message}</div>
          <div style={{fontSize:12,color:G.muted,marginTop:3}}>{r.sport} · {r.date} {r.time}</div>
        </div>
        <span style={{fontFamily:"'Oswald',sans-serif",fontSize:10,padding:'2px 7px',borderRadius:4,background:r.sent?G.greenBg:'#fef9c3',color:r.sent?G.green:'#854d0e',whiteSpace:'nowrap'}}>{r.sent?'Sent':'Scheduled'}</span>
      </div>):<Card><Empty msg="No reminders yet."/></Card>}
      {modal&&<Modal title="Schedule Reminder" onClose={()=>setModal(false)}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div><label style={s.label}>Type</label><select style={s.input} value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value}))}><option value="game">Game Reminder</option><option value="practice">Practice Reminder</option><option value="announcement">Announcement Alert</option></select></div>
          <div><label style={s.label}>Sport</label><select style={s.input} value={f.sport} onChange={e=>setF(x=>({...x,sport:e.target.value}))}><option value="">Select...</option>{sportList.map(sp=><option key={sp} value={sp}>{sp}</option>)}</select></div>
        </div>
        <div style={{marginBottom:12}}><label style={s.label}>Message</label><textarea style={{...s.input,minHeight:80,resize:'vertical'}} placeholder="Reminder message..." value={f.message} onChange={e=>setF(x=>({...x,message:e.target.value}))}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
          <div><label style={s.label}>Date</label><input style={s.input} placeholder="e.g. Mar 20" value={f.date} onChange={e=>setF(x=>({...x,date:e.target.value}))}/></div>
          <div><label style={s.label}>Time</label><input style={s.input} value={f.time} onChange={e=>setF(x=>({...x,time:e.target.value}))}/></div>
        </div>
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={save}>Schedule</Btn><Btn variant="outline" onClick={()=>setModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHOTOS
  // ─────────────────────────────────────────────────────────────────────────
  function PhotoTab() {
    const [modal, setModal] = useState(false);
    const [upTitle, setUpTitle] = useState('');
    const [upCat, setUpCat] = useState('Game Action');
    const [upSport, setUpSport] = useState('ALL');
    const [upFile, setUpFile] = useState(null);
    const [upPreview, setUpPreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef();
    const canApprove = user.role==='admin'||user.role==='coach';
    const handleFile = e => {
      const f = e.target.files[0]; if(!f) return;
      setUpFile(f);
      const r = new FileReader(); r.onload = ev => setUpPreview(ev.target.result); r.readAsDataURL(f);
    };
    const submit = async () => {
      setUploading(true);
      await uploadPhoto(upTitle, upCat, upSport, upFile);
      setUpTitle(''); setUpCat('Game Action'); setUpSport('ALL'); setUpFile(null); setUpPreview(null);
      setModal(false); setUploading(false);
    };
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Photo Gallery</span><span style={s.pageSub}>{photos.length} photos</span></div><Btn variant="gold" sm onClick={()=>setModal(true)}>+ Upload</Btn></div>
      {canApprove&&pendingPhotos.length>0&&<Card style={{borderColor:'rgba(201,150,26,0.4)'}}>
        <div style={{...s.cardTitle,display:'flex',alignItems:'center',justifyContent:'space-between'}}>Pending Review<span style={{background:G.goldPale,color:G.gold,fontSize:11,fontFamily:"'Oswald',sans-serif",padding:'2px 8px',borderRadius:4}}>{pendingPhotos.length}</span></div>
        {pendingPhotos.map(p=><div key={p.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:`0.5px solid ${G.off}`}}>
          {p.storageUrl&&<img src={p.storageUrl} alt={p.title} style={{width:52,height:52,borderRadius:7,objectFit:'cover',flexShrink:0}}/>}
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{p.title}</div><div style={{fontSize:12,color:G.muted}}>{p.cat||p.category} · {p.uploader}</div></div>
          <div style={{display:'flex',gap:6}}><Btn variant="gold" sm onClick={()=>approvePhoto(p.id)}>Approve</Btn><Btn variant="danger" sm onClick={()=>rejectPhoto(p.id)}>Decline</Btn></div>
        </div>)}
      </Card>}
      <FilterBar cats={['All',...PHOTO_CATS]} active={photoCat} onChange={setPhotoCat}/>
      {visiblePhotos.length?<PhotoGrid photos={visiblePhotos} onPhotoClick={i=>setLbIdx(i)}/>:<Card><Empty msg="No photos in this category yet."/></Card>}
      {lbIdx!==null&&<Lightbox photos={visiblePhotos} idx={lbIdx} onClose={()=>setLbIdx(null)} onNav={d=>setLbIdx(i=>(i+d+visiblePhotos.length)%visiblePhotos.length)}/>}
      {modal&&<Modal title="Upload Photo" onClose={()=>setModal(false)}>
        <div onClick={()=>fileRef.current.click()} style={{border:`1.5px dashed rgba(201,150,26,0.4)`,borderRadius:10,padding:'24px 20px',textAlign:'center',cursor:'pointer',background:G.goldPale,marginBottom:12}}>
          <div style={{fontSize:32,marginBottom:8}}>📷</div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,fontWeight:500,color:G.black}}>{upFile?upFile.name:'Click to choose a photo'}</div>
          <div style={{fontSize:12,color:G.muted,marginTop:4}}>JPG, PNG or GIF</div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleFile}/>
        {upPreview&&<img src={upPreview} style={{width:'100%',height:140,objectFit:'cover',borderRadius:8,marginBottom:12}} alt="preview"/>}
        <div style={{marginBottom:12}}><label style={s.label}>Title</label><input style={s.input} placeholder="e.g. Football vs. Carter HS" value={upTitle} onChange={e=>setUpTitle(e.target.value)}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div><label style={s.label}>Category</label><select style={s.input} value={upCat} onChange={e=>setUpCat(e.target.value)}>{PHOTO_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><label style={s.label}>Sport</label><select style={s.input} value={upSport} onChange={e=>setUpSport(e.target.value)}><option value="ALL">All Sports</option>{SPORTS.map(sp=><option key={sp.key} value={sp.key}>{sp.key}</option>)}</select></div>
        </div>
        <div style={{fontSize:12,color:G.muted,marginBottom:14}}>Photos require coach/admin approval before going live.</div>
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={submit} disabled={uploading}>{uploading?'Uploading...':'Submit for Review'}</Btn><Btn variant="outline" onClick={()=>setModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMMUNITY / FAN ZONE
  // ─────────────────────────────────────────────────────────────────────────
  function CommunityTab() {
    const [scoreModal, setScoreModal] = useState(false);
    const [sf, setSf] = useState({gameId:'',us:'',them:'',quarter:'4th'});
    const canUpdate = user.role==='coach'||user.role==='admin';
    const save = async () => {
      if(!sf.gameId) return;
      await updateLiveScore(sf.gameId, parseInt(sf.us)||0, parseInt(sf.them)||0, sf.quarter);
      setScoreModal(false);
    };
    return <div>
      <div style={s.pageHeader}><div><span style={s.pageTitle}>Fan Zone</span></div>{canUpdate&&<Btn variant="gold" sm onClick={()=>setScoreModal(true)}>📡 Update Score</Btn>}</div>
      {liveGames.length>0&&<Card style={{border:`1.5px solid ${G.red}`,background:'#fff8f8'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
          <span style={{background:G.red,color:'#fff',fontSize:10,fontFamily:"'Oswald',sans-serif",fontWeight:700,padding:'2px 8px',borderRadius:4,letterSpacing:'1px'}}>● LIVE</span>
          <span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:600,color:G.black,letterSpacing:'0.5px',textTransform:'uppercase'}}>Live Games</span>
        </div>
        {liveGames.map(g=><div key={g.id} style={{padding:'14px',background:G.off,borderRadius:8,marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><div style={{fontSize:13,color:G.muted}}>{g.sport}</div><div style={{fontSize:11,color:G.muted}}>{g.liveScore?.quarter}</div></div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{textAlign:'center'}}><div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:600,color:G.black}}>VIKINGS</div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:42,fontWeight:700,color:G.gold,lineHeight:1}}>{g.liveScore?.us}</div></div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:20,color:G.muted}}>—</div>
            <div style={{textAlign:'center'}}><div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:600,color:G.black}}>{g.opponent.replace('vs. ','').replace('@ ','')}</div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:42,fontWeight:700,color:G.black,lineHeight:1}}>{g.liveScore?.them}</div></div>
          </div>
        </div>)}
      </Card>}
      <Card><CardTitle>Upcoming Games</CardTitle>{schedules.filter(g=>!g.liveScore?.live).slice(0,5).map(g=><GameItem key={g.id} g={g}/>)||<Empty/>}</Card>
      <Card style={{background:G.goldPale,border:`0.5px solid rgba(201,150,26,0.3)`}}>
        <CardTitle>🛍️ Vikings Spirit Store</CardTitle>
        <div style={{fontSize:13,color:'#7A5200',lineHeight:1.6,marginBottom:12}}>Show your Vikings pride! Shop official Pinkston gear.</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
          {[{item:'Vikings Hoodie',price:'$45',emoji:'👕'},{item:'Dad Hat',price:'$22',emoji:'🧢'},{item:'Car Decal',price:'$8',emoji:'🏷️'}].map(p=><div key={p.item} style={{background:G.white,borderRadius:8,padding:'12px 8px',textAlign:'center',border:`0.5px solid rgba(0,0,0,0.08)`}}><div style={{fontSize:28,marginBottom:6}}>{p.emoji}</div><div style={{fontSize:12,fontWeight:600,color:G.black,marginBottom:2}}>{p.item}</div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:G.gold}}>{p.price}</div></div>)}
        </div>
        <Btn variant="primary" sm onClick={()=>notify('Spirit store link — add your store URL here before launch!')}>Visit Spirit Store →</Btn>
      </Card>
      <Card style={{background:G.off}}>
        <CardTitle>🏆 Booster Club</CardTitle>
        <div style={{fontSize:13,color:G.muted,lineHeight:1.6,marginBottom:12}}>Support the Vikings! Booster club sign-up coming soon.</div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <input style={{...s.input,flex:1}} placeholder="your@email.com — notify me when live"/>
          <Btn variant="gold" sm onClick={()=>notify('Added to the list!')}>Notify Me</Btn>
        </div>
      </Card>
      {scoreModal&&<Modal title="Update Live Score" onClose={()=>setScoreModal(false)}>
        <div style={{marginBottom:12}}><label style={s.label}>Game</label><select style={s.input} value={sf.gameId} onChange={e=>setSf(x=>({...x,gameId:e.target.value}))}><option value="">Select game...</option>{schedules.map(g=><option key={g.id} value={g.id}>{g.sport} — {g.opponent} {g.month} {g.day}</option>)}</select></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div><label style={s.label}>Vikings Score</label><input style={s.input} type="number" placeholder="45" value={sf.us} onChange={e=>setSf(x=>({...x,us:e.target.value}))}/></div>
          <div><label style={s.label}>Opponent Score</label><input style={s.input} type="number" placeholder="38" value={sf.them} onChange={e=>setSf(x=>({...x,them:e.target.value}))}/></div>
        </div>
        <div style={{marginBottom:16}}><label style={s.label}>Period</label><select style={s.input} value={sf.quarter} onChange={e=>setSf(x=>({...x,quarter:e.target.value}))}>{['1st','2nd','3rd','4th','OT','Final'].map(q=><option key={q}>{q}</option>)}</select></div>
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={save}>Update</Btn><Btn variant="outline" onClick={()=>setScoreModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────
  function StatsTab() {
    const [sportFilter, setSportFilter] = useState('Football');
    const [statModal, setStatModal] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [gameRef, setGameRef] = useState('');
    const [statInputs, setStatInputs] = useState({});
    const [saving, setSaving] = useState(false);
    const [viewPlayer, setViewPlayer] = useState(null);

    const canEdit = user.role==='coach'||user.role==='admin';

    // Position groups and their stats
    const POSITION_STATS = {
      QB: [
        {key:'passYds',label:'Pass Yds',short:'PYD'},{key:'passAtt',label:'Pass Att',short:'ATT'},
        {key:'passComp',label:'Completions',short:'CMP'},{key:'passTDs',label:'Pass TDs',short:'PTD'},
        {key:'ints',label:'Interceptions',short:'INT'},{key:'rushYds',label:'Rush Yds',short:'RYD'},
        {key:'rushAtt',label:'Rush Att',short:'RA'},{key:'rushTDs',label:'Rush TDs',short:'RTD'},
        {key:'fumbles',label:'Fumbles',short:'FUM'},
      ],
      RB: [
        {key:'rushYds',label:'Rush Yds',short:'RYD'},{key:'rushAtt',label:'Rush Att',short:'RA'},
        {key:'rushTDs',label:'Rush TDs',short:'RTD'},{key:'fumbles',label:'Fumbles',short:'FUM'},
        {key:'rec',label:'Receptions',short:'REC'},{key:'recYds',label:'Rec Yds',short:'RYDS'},
        {key:'recTDs',label:'Rec TDs',short:'RTDS'},{key:'pancakes',label:'Pancakes',short:'PAN'},
      ],
      'WR/TE': [
        {key:'rec',label:'Receptions',short:'REC'},{key:'recYds',label:'Rec Yds',short:'RYDS'},
        {key:'recTDs',label:'Rec TDs',short:'RTDS'},{key:'rushYds',label:'Rush Yds',short:'RYD'},
        {key:'rushAtt',label:'Rush Att',short:'RA'},{key:'rushTDs',label:'Rush TDs',short:'RTD'},
        {key:'fumbles',label:'Fumbles',short:'FUM'},{key:'pancakes',label:'Pancakes',short:'PAN'},
      ],
      OL: [
        {key:'pancakes',label:'Pancakes',short:'PAN'},
      ],
      'DL/LB/DB': [
        {key:'tackles',label:'Tackles',short:'TKL'},{key:'tfl',label:'TFL',short:'TFL'},
        {key:'sacks',label:'Sacks',short:'SCK'},{key:'ints',label:'Interceptions',short:'INT'},
        {key:'forcedFumbles',label:'Forced Fumbles',short:'FF'},{key:'fumbleRec',label:'Fumble Rec',short:'FR'},
        {key:'defTDs',label:'Touchdowns',short:'TD'},
      ],
      K: [
        {key:'fgAtt',label:'FG Att',short:'FGA'},{key:'fgMade',label:'FG Made',short:'FGM'},
        {key:'xpAtt',label:'XP Att',short:'XPA'},{key:'xpMade',label:'XP Made',short:'XPM'},
      ],
    };

    const POSITIONS = Object.keys(POSITION_STATS);

    // Get athletes for selected sport
    const sportAthletes = athletes.filter(a => a.sport === sportFilter);

    // Get all game stats for selected sport
    const sportGameStats = gameStats.filter(g => g.sport === sportFilter);

    // Calculate season totals per player
    const getPlayerSeasonTotals = (athleteId) => {
      const games = sportGameStats.filter(g => g.athleteId === athleteId);
      const totals = {};
      games.forEach(g => {
        Object.entries(g.stats||{}).forEach(([k,v]) => {
          totals[k] = (totals[k]||0) + (parseFloat(v)||0);
        });
      });
      // Calculated stats
      if(totals.passAtt > 0) {
        totals.compPct = Math.round((totals.passComp||0) / totals.passAtt * 100);
        totals.ydsPerComp = totals.passComp > 0 ? (totals.passYds / totals.passComp).toFixed(1) : 0;
        totals.passYdsPerGame = games.length > 0 ? Math.round(totals.passYds / games.length) : 0;
      }
      if(totals.rushAtt > 0) {
        totals.ydsPerRush = (totals.rushYds / totals.rushAtt).toFixed(1);
        totals.rushYdsPerGame = games.length > 0 ? Math.round(totals.rushYds / games.length) : 0;
      }
      if(totals.rec > 0) {
        totals.ydsPerRec = (totals.recYds / totals.rec).toFixed(1);
        totals.recYdsPerGame = games.length > 0 ? Math.round(totals.recYds / games.length) : 0;
      }
      if(totals.fgAtt > 0) totals.fgPct = Math.round((totals.fgMade||0) / totals.fgAtt * 100);
      if(totals.xpAtt > 0) totals.xpPct = Math.round((totals.xpMade||0) / totals.xpAtt * 100);
      return { ...totals, games: games.length };
    };

    const openStatEntry = (athlete) => {
      setSelectedPlayer(athlete);
      setGameRef('');
      setStatInputs({});
      setStatModal(true);
    };

    const saveStats = async () => {
      if(!gameRef.trim()){notify('Enter a game reference (e.g. "vs Lincoln Apr 5").');return;}
      setSaving(true);
      await fdb.add('gameStats', {
        athleteId: selectedPlayer.id,
        athleteName: selectedPlayer.name,
        sport: sportFilter,
        position: selectedPlayer.position || 'N/A',
        gameRef,
        stats: statInputs,
        enteredBy: user.name,
      });
      setSaving(false);
      setStatModal(false);
      notify(`Stats saved for ${selectedPlayer.name}!`);
    };

    const getStatFields = (athlete) => {
      const pos = athlete.position || '';
      for(const [group, fields] of Object.entries(POSITION_STATS)) {
        if(pos.includes(group) || group === pos) return { group, fields };
      }
      // Default to position group matching
      if(['QB'].includes(pos)) return { group:'QB', fields: POSITION_STATS.QB };
      if(['RB','HB','FB'].includes(pos)) return { group:'RB', fields: POSITION_STATS.RB };
      if(['WR','TE','WR/TE'].includes(pos)) return { group:'WR/TE', fields: POSITION_STATS['WR/TE'] };
      if(['OL','LT','LG','C','RG','RT'].includes(pos)) return { group:'OL', fields: POSITION_STATS.OL };
      if(['DL','DE','DT','LB','MLB','OLB','CB','S','DB','FS','SS'].includes(pos)) return { group:'DL/LB/DB', fields: POSITION_STATS['DL/LB/DB'] };
      if(['K','P'].includes(pos)) return { group:'K', fields: POSITION_STATS.K };
      return { group:'DL/LB/DB', fields: POSITION_STATS['DL/LB/DB'] };
    };

    // Leader for a stat
    const getLeader = (statKey) => {
      let best = null, bestVal = -1;
      sportAthletes.forEach(a => {
        const totals = getPlayerSeasonTotals(a.id);
        const val = totals[statKey]||0;
        if(val > bestVal){ bestVal = val; best = {athlete:a, val}; }
      });
      return best;
    };

    return <div>
      <div style={s.pageHeader}>
        <div><span style={s.pageTitle}>Statistics</span></div>
      </div>

      {/* Sport filter */}
      <FilterBar cats={['Football',...SPORTS.filter(s=>s.key!=='Football').map(s=>s.key)]} active={sportFilter} onChange={setSportFilter}/>

      {sportFilter === 'Football' ? <>
        {/* Season leaders strip */}
        {sportAthletes.length > 0 && <Card style={{marginBottom:12}}>
          <CardTitle>Season Leaders — {sportFilter}</CardTitle>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {[
              {label:'Pass Yds',key:'passYds',suffix:''},
              {label:'Rush Yds',key:'rushYds',suffix:''},
              {label:'Rec Yds',key:'recYds',suffix:''},
              {label:'Pass TDs',key:'passTDs',suffix:''},
              {label:'Tackles',key:'tackles',suffix:''},
              {label:'Sacks',key:'sacks',suffix:''},
            ].map(({label,key,suffix})=>{
              const leader = getLeader(key);
              return <div key={key} style={{background:G.off,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,fontFamily:"'Oswald',sans-serif",letterSpacing:'1px',textTransform:'uppercase',color:G.muted,marginBottom:4}}>{label}</div>
                {leader ? <>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:700,color:G.gold}}>{leader.val}{suffix}</div>
                  <div style={{fontSize:12,color:G.black,fontWeight:500}}>{leader.athlete.name}</div>
                </> : <div style={{fontSize:13,color:G.muted}}>No data</div>}
              </div>;
            })}
          </div>
        </Card>}

        {/* Player stat cards */}
        {POSITIONS.map(pos => {
          const posAthletes = sportAthletes.filter(a => {
            const p = a.position||'';
            if(pos==='QB') return p==='QB';
            if(pos==='RB') return ['RB','HB','FB'].includes(p);
            if(pos==='WR/TE') return ['WR','TE'].includes(p);
            if(pos==='OL') return ['OL','LT','LG','C','RG','RT'].includes(p);
            if(pos==='DL/LB/DB') return ['DL','DE','DT','LB','MLB','OLB','CB','S','DB','FS','SS'].includes(p);
            if(pos==='K') return ['K','P'].includes(p);
            return false;
          });
          if(posAthletes.length===0) return null;
          const fields = POSITION_STATS[pos];
          return <Card key={pos} style={{marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <CardTitle style={{margin:0}}>{pos}</CardTitle>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:400}}>
                <thead>
                  <tr>
                    <th style={{fontFamily:"'Oswald',sans-serif",fontSize:10,fontWeight:500,letterSpacing:'1px',textTransform:'uppercase',color:G.muted,textAlign:'left',padding:'6px 8px',borderBottom:`1px solid ${G.off}`,whiteSpace:'nowrap'}}>Player</th>
                    <th style={{fontFamily:"'Oswald',sans-serif",fontSize:10,fontWeight:500,letterSpacing:'1px',textTransform:'uppercase',color:G.muted,textAlign:'center',padding:'6px 8px',borderBottom:`1px solid ${G.off}`}}>GP</th>
                    {fields.map(f=><th key={f.key} style={{fontFamily:"'Oswald',sans-serif",fontSize:10,fontWeight:500,letterSpacing:'1px',textTransform:'uppercase',color:G.muted,textAlign:'center',padding:'6px 8px',borderBottom:`1px solid ${G.off}`,whiteSpace:'nowrap'}}>{f.short}</th>)}
                    {canEdit&&<th style={{borderBottom:`1px solid ${G.off}`,padding:'6px 8px'}}></th>}
                  </tr>
                </thead>
                <tbody>
                  {posAthletes.map(a=>{
                    const totals = getPlayerSeasonTotals(a.id);
                    return <tr key={a.id} onClick={()=>setViewPlayer(viewPlayer?.id===a.id?null:a)} style={{cursor:'pointer',background:viewPlayer?.id===a.id?G.goldPale:'transparent'}}>
                      <td style={{padding:'9px 8px',fontWeight:600,color:G.black,fontSize:13}}>
                        <div>{a.name}</div>
                        <div style={{fontSize:10,color:G.muted}}>#{a.jersey||'—'}</div>
                      </td>
                      <td style={{padding:'9px 8px',textAlign:'center',color:G.muted,fontSize:12}}>{totals.games||0}</td>
                      {fields.map(f=><td key={f.key} style={{padding:'9px 8px',textAlign:'center',fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:totals[f.key]>0?600:400,color:totals[f.key]>0?G.black:G.muted}}>{totals[f.key]||0}</td>)}
                      {canEdit&&<td style={{padding:'9px 8px',textAlign:'center'}}>
                        <button onClick={e=>{e.stopPropagation();openStatEntry(a);}} style={{background:G.black,color:G.gold,border:'none',borderRadius:6,padding:'4px 10px',fontFamily:"'Oswald',sans-serif",fontSize:10,letterSpacing:'1px',cursor:'pointer'}}>+ Stats</button>
                      </td>}
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-game breakdown when player is selected */}
            {viewPlayer && posAthletes.find(a=>a.id===viewPlayer.id) && <div style={{marginTop:12,borderTop:`0.5px solid ${G.off}`,paddingTop:12}}>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:12,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:G.muted,marginBottom:8}}>{viewPlayer.name} — Game Log</div>
              {sportGameStats.filter(g=>g.athleteId===viewPlayer.id).length===0
                ? <div style={{fontSize:13,color:G.muted}}>No game stats entered yet.</div>
                : sportGameStats.filter(g=>g.athleteId===viewPlayer.id).map(g=><div key={g.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:`0.5px solid ${G.off}`,fontSize:12}}>
                    <div style={{fontWeight:600,color:G.black,minWidth:120}}>{g.gameRef}</div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {Object.entries(g.stats||{}).filter(([,v])=>parseFloat(v)>0).map(([k,v])=>{
                        const field = fields.find(f=>f.key===k);
                        return field ? <span key={k} style={{fontSize:11,background:G.off,borderRadius:4,padding:'2px 6px'}}><span style={{color:G.muted}}>{field.short}: </span><span style={{fontWeight:600,color:G.black}}>{v}</span></span> : null;
                      })}
                    </div>
                  </div>)
              }
            </div>}
          </Card>;
        })}

        {sportAthletes.length===0&&<Card><Empty msg={`No athletes on the ${sportFilter} roster yet.`}/></Card>}

      </> : <Card><div style={{color:G.muted,fontSize:13,padding:'8px 0'}}>Stats for {sportFilter} coming soon. Select Football to view current stats.</div></Card>}

      {/* Add stats modal */}
      {statModal&&selectedPlayer&&<Modal title={`Enter Stats — ${selectedPlayer.name}`} onClose={()=>setStatModal(false)}>
        <div style={{marginBottom:12}}>
          <label style={s.label}>Game Reference</label>
          <input style={s.input} placeholder="e.g. vs Lincoln Apr 5" value={gameRef} onChange={e=>setGameRef(e.target.value)}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={s.label}>Position</label>
          <select style={s.input} value={selectedPlayer.position||''} onChange={e=>{
            updateDoc(doc(db,'users',selectedPlayer.id),{position:e.target.value});
            setSelectedPlayer(p=>({...p,position:e.target.value}));
          }}>
            <option value="">Select position...</option>
            {['QB','RB','HB','FB','WR','TE','OL','LT','LG','C','RG','RT','DL','DE','DT','LB','MLB','OLB','CB','S','DB','FS','SS','K','P'].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          {getStatFields(selectedPlayer).fields.map(f=><div key={f.key}>
            <label style={s.label}>{f.label}</label>
            <input style={s.input} type="number" min="0" placeholder="0" value={statInputs[f.key]||''} onChange={e=>setStatInputs(x=>({...x,[f.key]:e.target.value}))}/>
          </div>)}
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn variant="primary" onClick={saveStats} disabled={saving}>{saving?'Saving...':'Save Stats'}</Btn>
          <Btn variant="outline" onClick={()=>setStatModal(false)}>Cancel</Btn>
        </div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MESSAGES
  // ─────────────────────────────────────────────────────────────────────────
  function MessagesTab() {
    const canMsg = user.role==='coach'||user.role==='parent'||user.role==='admin';
    const [newModal, setNewModal] = useState(false);
    const [newCoachId, setNewCoachId] = useState('');
    const [newMsgText, setNewMsgText] = useState('');
    const coaches = users.filter(u=>u.role==='coach');
    const threadIdFor = (a,b) => [a,b].sort().join('_');

    // Get my threads by looking at all messages
    const myThreads = {};
    messages.forEach(m => {
      if(m.senderId===user.id||m.receiverId===user.id) {
        const otherId = m.senderId===user.id?m.receiverId:m.senderId;
        const tid = threadIdFor(user.id, otherId);
        if(!myThreads[tid]) myThreads[tid] = {threadId:tid, otherId, msgs:[]};
        myThreads[tid].msgs.push(m);
      }
    });

    const threadList = Object.values(myThreads).map(t => ({
      ...t,
      other: users.find(u=>u.id===t.otherId)||{name:'Unknown',role:''},
      lastMsg: t.msgs[t.msgs.length-1],
      unread: t.msgs.filter(m=>m.receiverId===user.id&&!m.read).length,
    }));

    const activeMessages = activeThread ? messages.filter(m=>m.threadId===activeThread) : [];
    const otherUserId = activeMessages.length ? (activeMessages[0].senderId===user.id?activeMessages[0].receiverId:activeMessages[0].senderId) : null;
    const other = users.find(u=>u.id===otherUserId);

    const startNewThread = async () => {
      if(!newCoachId||!newMsgText.trim()) return;
      const tid = threadIdFor(user.id, newCoachId);
      await fdb.add(`threads/${tid}/messages`,{senderId:user.id,senderName:user.name,receiverId:newCoachId,text:newMsgText.trim()});
      setActiveThread(tid);
      setNewModal(false); setNewMsgText('');
      notify('Message sent!');
    };

    if(!canMsg) return <div><div style={s.pageHeader}><span style={s.pageTitle}>Messages</span></div><Card><Empty msg="Messaging is available for coaches, parents, and admins."/></Card></div>;

    return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>Messages</span>{user.role==='parent'&&<Btn variant="gold" sm onClick={()=>setNewModal(true)}>+ New</Btn>}</div>
      <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:12,height:520}}>
        <div style={{background:G.white,borderRadius:10,border:`0.5px solid rgba(0,0,0,0.08)`,overflowY:'auto'}}>
          {threadList.length?threadList.map(t=><div key={t.threadId} onClick={()=>setActiveThread(t.threadId)} style={{padding:'12px 14px',borderBottom:`0.5px solid ${G.off}`,cursor:'pointer',background:activeThread===t.threadId?G.goldPale:G.white,borderLeft:activeThread===t.threadId?`3px solid ${G.gold}`:'3px solid transparent'}}>
            <div style={{fontWeight:600,fontSize:13,color:G.black}}>{t.other.name}{t.unread>0&&<span style={{background:G.gold,color:G.black,fontSize:9,fontFamily:"'Oswald',sans-serif",fontWeight:700,padding:'1px 5px',borderRadius:8,marginLeft:5}}>{t.unread}</span>}</div>
            <div style={{fontSize:12,color:G.muted,marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.lastMsg?.text}</div>
          </div>):<div style={{padding:16,fontSize:13,color:G.muted}}>No conversations yet.</div>}
        </div>
        <div style={{background:G.white,borderRadius:10,border:`0.5px solid rgba(0,0,0,0.08)`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {activeThread&&other?<>
            <div style={{padding:'14px 16px',borderBottom:`0.5px solid ${G.off}`,flexShrink:0}}>
              <div style={{fontWeight:600,fontSize:15,color:G.black}}>{other.name}</div>
              <div style={{fontSize:12,color:G.muted}}><Badge role={other.role}>{other.role}</Badge>{other.sport?' · '+other.sport:''}</div>
            </div>
            <div ref={chatRef} style={{flex:1,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:10}}>
              {activeMessages.map(m=>{const out=m.senderId===user.id;return <div key={m.id}><div style={{maxWidth:'75%',padding:'10px 13px',borderRadius:12,fontSize:13,lineHeight:1.5,background:out?G.black:G.off,color:out?G.gold:G.black,marginLeft:out?'auto':0,borderBottomRightRadius:out?3:12,borderBottomLeftRadius:out?12:3}}>{m.text}</div></div>;})}
            </div>
            <div style={{padding:'12px 14px',borderTop:`0.5px solid ${G.off}`,display:'flex',gap:8,flexShrink:0}}>
              <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){sendMessage(activeThread,otherUserId);setMsgInput('');}}} placeholder="Type a message..." style={{flex:1,padding:'9px 12px',border:`0.5px solid rgba(0,0,0,0.15)`,borderRadius:20,fontSize:13,outline:'none'}}/>
              <button onClick={()=>{sendMessage(activeThread,otherUserId);setMsgInput('');}} style={{background:G.black,color:G.gold,border:'none',borderRadius:20,padding:'9px 16px',fontFamily:"'Oswald',sans-serif",fontSize:12,letterSpacing:'0.8px',cursor:'pointer'}}>Send</button>
            </div>
          </>:<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:G.muted,fontSize:14}}>Select a conversation</div>}
        </div>
      </div>
      {newModal&&<Modal title="New Message" onClose={()=>setNewModal(false)}>
        <div style={{marginBottom:12}}><label style={s.label}>Send to Coach</label><select style={s.input} value={newCoachId} onChange={e=>setNewCoachId(e.target.value)}><option value="">Select coach...</option>{coaches.map(c=><option key={c.id} value={c.id}>{c.name}{c.sport?' ('+c.sport+')':''}</option>)}</select></div>
        <div style={{marginBottom:16}}><label style={s.label}>Message</label><textarea style={{...s.input,minHeight:80,resize:'vertical'}} value={newMsgText} onChange={e=>setNewMsgText(e.target.value)} placeholder="Type your message..."/></div>
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={startNewThread}>Send</Btn><Btn variant="outline" onClick={()=>setNewModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVALS
  // ─────────────────────────────────────────────────────────────────────────
  function ApprovalsTab() {
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [linkModal, setLinkModal] = useState(false);
    const [linkParentId, setLinkParentId] = useState('');
    const [linkAthleteId, setLinkAthleteId] = useState('');
    const [linkLoading, setLinkLoading] = useState(false);

    const parents = users.filter(u=>u.role==='parent');
    const athleteList = users.filter(u=>u.role==='athlete');

    const saveLink = async () => {
      if(!linkParentId||!linkAthleteId){notify('Please select both a parent and an athlete.');return;}
      setLinkLoading(true);
      const athlete = athleteList.find(u=>u.id===linkAthleteId);
      if(!athlete){notify('Athlete not found.');setLinkLoading(false);return;}
      await updateDoc(doc(db,'users',linkParentId),{
        childId: linkAthleteId,
        childName: athlete.name,
      });
      setLinkModal(false);setLinkParentId('');setLinkAthleteId('');setLinkLoading(false);
      notify(`✅ Parent linked to ${athlete.name} successfully!`);
    };

    const currentLink = (parentId) => {
      const p = users.find(u=>u.id===parentId);
      return p?.childName ? `Currently linked to: ${p.childName}` : 'Not linked';
    };

    return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>Approvals</span><span style={s.pageSub}>{pendingUsers.length+pendingPhotos.length} pending</span></div>

      {/* PARENT-ATHLETE LINK */}
      <Card style={{border:`0.5px solid rgba(30,64,175,0.3)`,background:G.blueBg}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:G.blue}}>🔗 Link Parent to Athlete</div>
            <div style={{fontSize:12,color:G.blue,marginTop:4,opacity:0.8}}>Connect a parent account to their child so attendance notifications work correctly.</div>
          </div>
          <Btn variant="primary" sm onClick={()=>setLinkModal(true)}>Link Now</Btn>
        </div>
        {/* Show current links */}
        {parents.length>0&&<div style={{marginTop:10,borderTop:`0.5px solid rgba(30,64,175,0.2)`,paddingTop:10}}>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:'1px',textTransform:'uppercase',color:G.blue,marginBottom:8}}>Current Parent Links</div>
          {parents.map(p=><div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:`0.5px solid rgba(30,64,175,0.15)`,fontSize:13}}>
            <div>
              <span style={{fontWeight:600,color:G.black}}>{p.name}</span>
              <span style={{fontSize:12,color:G.blue,marginLeft:8}}>{p.childName?`→ ${p.childName}`:'⚠️ Not linked'}</span>
            </div>
            <Btn variant="outline" sm onClick={()=>{setLinkParentId(p.id);setLinkAthleteId('');setLinkModal(true);}}>
              {p.childName?'Re-link':'Link'}
            </Btn>
          </div>)}
        </div>}
      </Card>

      {pendingPhotos.length>0&&<Card>
        <CardTitle>Photos ({pendingPhotos.length})</CardTitle>
        {pendingPhotos.map(p=><div key={p.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:`0.5px solid ${G.off}`}}>
          {p.storageUrl&&<img src={p.storageUrl} alt={p.title} style={{width:52,height:52,borderRadius:7,objectFit:'cover',flexShrink:0}}/>}
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{p.title}</div><div style={{fontSize:12,color:G.muted}}>{p.cat||p.category} · {p.uploader}</div></div>
          <div style={{display:'flex',gap:6}}><Btn variant="gold" sm onClick={()=>approvePhoto(p.id)}>Approve</Btn><Btn variant="danger" sm onClick={()=>rejectPhoto(p.id)}>Decline</Btn></div>
        </div>)}
      </Card>}

      <Card>
        <CardTitle>Pending Users ({pendingUsers.length})</CardTitle>
        {pendingUsers.length?pendingUsers.map(u=><div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:`0.5px solid ${G.off}`}}>
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{u.name} <Badge role={u.role}>{u.role}</Badge></div><div style={{fontSize:12,color:G.muted}}>{u.email}{u.sport?' · '+u.sport:''}{u.childName?' · Parent of '+u.childName:''}</div></div>
          <div style={{display:'flex',gap:6}}><Btn variant="gold" sm onClick={()=>approveUser(u.id)}>Approve</Btn><Btn variant="danger" sm onClick={()=>rejectUser(u.id)}>Decline</Btn></div>
        </div>):<Empty msg="No pending users."/>}
      </Card>

      <Card>
        <CardTitle>User Management — All Accounts ({users.length})</CardTitle>
        <div style={{fontSize:12,color:G.muted,marginBottom:12,lineHeight:1.5}}>Delete an account to permanently remove a user's access. Historical data will be preserved.</div>
        {users.filter(u=>u.id!==user.id).map(u=><div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:`0.5px solid ${G.off}`}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:14,color:G.black}}>{u.name} <Badge role={u.role}>{u.role}</Badge></div>
            <div style={{fontSize:12,color:G.muted}}>{u.email}{u.sport?' · '+u.sport:''}{u.childName?` · Parent of ${u.childName}`:''}</div>
          </div>
          <Btn variant="danger" sm onClick={()=>setConfirmDelete({id:u.id,name:u.name})}>Delete</Btn>
        </div>)}
      </Card>

      {/* LINK MODAL */}
      {linkModal&&<Modal title="Link Parent to Athlete" onClose={()=>{setLinkModal(false);setLinkParentId('');setLinkAthleteId('');}}>
        <div style={{fontSize:13,color:'#555',lineHeight:1.6,marginBottom:16}}>Select a parent and their child's athlete account. Once linked, the parent will automatically receive attendance notifications for their child.</div>
        <div style={{marginBottom:12}}>
          <label style={s.label}>Parent Account</label>
          <select style={s.input} value={linkParentId} onChange={e=>setLinkParentId(e.target.value)}>
            <option value="">Select parent...</option>
            {parents.map(p=><option key={p.id} value={p.id}>{p.name} — {p.childName?`linked to ${p.childName}`:'not linked'}</option>)}
          </select>
        </div>
        <div style={{marginBottom:16}}>
          <label style={s.label}>Their Child (Athlete Account)</label>
          <select style={s.input} value={linkAthleteId} onChange={e=>setLinkAthleteId(e.target.value)}>
            <option value="">Select athlete...</option>
            {athleteList.map(a=><option key={a.id} value={a.id}>{a.name} — {a.sport||'No sport yet'} · Grade {a.grade||'—'}</option>)}
          </select>
        </div>
        {linkParentId&&linkAthleteId&&<div style={{fontSize:13,color:G.green,background:G.greenBg,padding:'10px 12px',borderRadius:6,marginBottom:14,lineHeight:1.5}}>
          ✅ Will link <strong>{users.find(u=>u.id===linkParentId)?.name}</strong> → <strong>{athleteList.find(u=>u.id===linkAthleteId)?.name}</strong>
        </div>}
        <div style={{display:'flex',gap:8}}>
          <Btn variant="primary" onClick={saveLink} disabled={linkLoading}>{linkLoading?'Saving...':'Save Link'}</Btn>
          <Btn variant="outline" onClick={()=>{setLinkModal(false);setLinkParentId('');setLinkAthleteId('');}}>Cancel</Btn>
        </div>
      </Modal>}

      {confirmDelete&&<Modal title="Delete Account" onClose={()=>setConfirmDelete(null)}>
        <div style={{fontSize:14,color:G.black,lineHeight:1.6,marginBottom:16}}>
          Are you sure you want to delete <strong>{confirmDelete.name}</strong>'s account?
          <div style={{marginTop:10,fontSize:13,color:G.red,background:G.redBg,padding:'10px 12px',borderRadius:6,lineHeight:1.6}}>
            ⚠️ This permanently removes their access. Attendance records and historical data will be preserved. This cannot be undone.
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn variant="danger" onClick={()=>{deleteUser(confirmDelete.id,confirmDelete.name);setConfirmDelete(null);}}>Yes, Delete Account</Btn>
          <Btn variant="outline" onClick={()=>setConfirmDelete(null)}>Cancel</Btn>
        </div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CALENDAR
  // ─────────────────────────────────────────────────────────────────────────
  function CalendarTab() {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const MONTH_MAP = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const TYPE_COLORS = {Game:'#0d0d0d',Practice:'#1a5a2a',Event:'#92640a'};
    const TYPE_BG = {Game:G.black,Practice:'#1a5a2a',Event:G.gold};
    const TYPE_ICONS = {Game:'🏟️',Practice:'🏃',Event:'📅'};

    const now = new Date();
    const [viewMonth, setViewMonth] = useState(now.getMonth());
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [selectedItem, setSelectedItem] = useState(null);
    const [typeFilter, setTypeFilter] = useState('All');
    const [sportFilter, setSportFilter] = useState('All');
    const [addModal, setAddModal] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [af, setAf] = useState({eventType:'Practice',sport:'',title:'',details:'',month:'',day:'',time:'',audience:'all',reminder:'none'});

    const canAdd = user.role==='admin'||user.role==='coach';
    const canDelete = user.role==='admin'||user.role==='coach';

    const deleteItem = async () => {
      if(!selectedItem) return;
      if(selectedItem.eventType==='Game') {
        await fdb.delete('schedules', selectedItem.id);
      } else {
        await fdb.delete('events', selectedItem.id);
      }
      setSelectedItem(null);
      setConfirmDelete(false);
      notify('Event removed from calendar.');
    };

    const REMINDER_OPTS = [
      {val:'none',label:'No reminder'},
      {val:'2hrs',label:'2 hours before'},
      {val:'12hrs',label:'12 hours before'},
      {val:'1day',label:'1 day before'},
      {val:'2days',label:'2 days before'},
      {val:'1week',label:'1 week before'},
    ];

    // Combine schedules (games) and events (practices/other) into one list
    const allItems = [
      ...schedules.map(g=>({...g, eventType:'Game', title:g.opponent, itemId:`g_${g.id}`})),
      ...events.map(e=>({...e, itemId:`e_${e.id}`})),
    ];

    // Parse dates
    const parsedItems = allItems.map(item=>{
      const monthNum = MONTH_MAP[item.month];
      const day = parseInt(item.day);
      if(monthNum===undefined||isNaN(day)) return null;
      return {...item, dateObj:new Date(viewYear, monthNum, day)};
    }).filter(Boolean);

    const filtered = parsedItems.filter(item=>{
      if(typeFilter!=='All'&&item.eventType!==typeFilter) return false;
      if(sportFilter!=='All'&&item.sport!==sportFilter) return false;
      return true;
    });

    const itemsForDay = (day) => filtered.filter(item=>
      item.dateObj.getFullYear()===viewYear &&
      item.dateObj.getMonth()===viewMonth &&
      item.dateObj.getDate()===day
    );

    // Build calendar grid
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const cells = [];
    for(let i=0;i<firstDay;i++) cells.push(null);
    for(let d=1;d<=daysInMonth;d++) cells.push(d);
    while(cells.length%7!==0) cells.push(null);

    const isToday = (day) => {
      const t = new Date();
      return day&&t.getFullYear()===viewYear&&t.getMonth()===viewMonth&&t.getDate()===day;
    };

    const saveEvent = async () => {
      if(!af.sport||!af.title||!af.month||!af.day){notify('Please fill in all required fields.');return;}
      await addEvent({...af});
      if(af.reminder!=='none') {
        const reminderLabels = {'2hrs':'2 hours','12hrs':'12 hours','1day':'1 day','2days':'2 days','1week':'1 week'};
        const reminderMsg = `Reminder: ${af.sport} ${af.eventType.toLowerCase()} — ${af.title} on ${af.month} ${af.day}${af.time?` at ${af.time}`:''}${af.details?`. ${af.details}`:''}. lgpathletics.net`;
        await scheduleReminder({type:af.eventType.toLowerCase(),sport:af.sport,message:reminderMsg,date:`${af.month} ${af.day}`,reminderTiming:af.reminder,reminderLabel:reminderLabels[af.reminder]||af.reminder,sent:false});
      }
      setAf({eventType:'Practice',sport:'',title:'',details:'',month:'',day:'',time:'',audience:'all',reminder:'none'});
      setAddModal(false);
    };

    const monthItems = filtered.filter(item=>item.dateObj.getMonth()===viewMonth&&item.dateObj.getFullYear()===viewYear).sort((a,b)=>a.dateObj-b.dateObj);

    return <div>
      <div style={s.pageHeader}>
        <div><span style={s.pageTitle}>Calendar</span></div>
        {canAdd&&<Btn variant="gold" sm onClick={()=>setAddModal(true)}>+ Add Event</Btn>}
      </div>

      {/* Type + Sport filters */}
      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
        {['All','Game','Practice','Event'].map(t=><button key={t} style={{...s.pill(typeFilter===t),background:typeFilter===t?(TYPE_BG[t]||G.black):G.white,color:typeFilter===t?'#fff':G.muted,border:`0.5px solid ${typeFilter===t?(TYPE_BG[t]||G.black):'rgba(0,0,0,0.12)'}`}} onClick={()=>setTypeFilter(t)}>{TYPE_ICONS[t]||''} {t}</button>)}
      </div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {['All',...SPORTS.map(s=>s.key)].map(sp=><button key={sp} style={s.pill(sportFilter===sp)} onClick={()=>setSportFilter(sp)}>{sp}</button>)}
      </div>

      {/* Month navigation */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <button onClick={()=>{if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1);}} style={{...s.btn('outline'),padding:'8px 14px',fontSize:18}}>‹</button>
        <div style={{fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:600,color:G.black,letterSpacing:'0.5px'}}>{MONTHS[viewMonth]} {viewYear}</div>
        <button onClick={()=>{if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1);}} style={{...s.btn('outline'),padding:'8px 14px',fontSize:18}}>›</button>
      </div>

      {/* Calendar grid */}
      <Card style={{padding:'12px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:4}}>
          {DAYS.map(d=><div key={d} style={{textAlign:'center',fontFamily:"'Oswald',sans-serif",fontSize:11,fontWeight:500,letterSpacing:'1px',textTransform:'uppercase',color:G.muted,padding:'4px 0'}}>{d}</div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
          {cells.map((day,i)=>{
            const items = day?itemsForDay(day):[];
            const today = isToday(day);
            return <div key={i} onClick={()=>{if(items.length===1)setSelectedItem(items[0]);else if(items.length>1)setSelectedItem(items[0]);}} style={{minHeight:68,borderRadius:7,padding:'4px',background:today?G.goldPale:day?G.white:'transparent',border:today?`1.5px solid ${G.gold}`:day?`0.5px solid rgba(0,0,0,0.06)`:'none',cursor:items.length>0?'pointer':'default'}}>
              {day&&<div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:today?700:400,color:today?G.gold:G.black,marginBottom:2}}>{day}</div>}
              {items.slice(0,2).map((item,gi)=><div key={gi} style={{fontSize:9,fontFamily:"'Oswald',sans-serif",letterSpacing:'0.3px',background:TYPE_BG[item.eventType]||G.black,color:'#fff',borderRadius:3,padding:'1px 4px',marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{TYPE_ICONS[item.eventType]} {item.sport?.split(' ').pop()||item.sport}</div>)}
              {items.length>2&&<div style={{fontSize:9,color:G.muted,fontFamily:"'Oswald',sans-serif"}}>+{items.length-2} more</div>}
            </div>;
          })}
        </div>
      </Card>

      {/* Legend */}
      <div style={{display:'flex',gap:12,marginTop:10,marginBottom:4,flexWrap:'wrap'}}>
        {[{type:'Game',label:'Game'},{type:'Practice',label:'Practice'},{type:'Event',label:'Other Event'}].map(({type,label})=><div key={type} style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:G.muted}}><div style={{width:10,height:10,borderRadius:2,background:TYPE_BG[type]}}/>{label}</div>)}
      </div>

      {/* This month's list */}
      <Card style={{marginTop:12}}>
        <CardTitle>{MONTHS[viewMonth]} Schedule</CardTitle>
        {monthItems.length===0?<Empty msg={`Nothing scheduled in ${MONTHS[viewMonth]}.`}/>:
          monthItems.map(item=><div key={item.itemId} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:`0.5px solid ${G.off}`}}>
            <div onClick={()=>setSelectedItem(item)} style={{width:38,height:38,borderRadius:8,background:TYPE_BG[item.eventType]||G.black,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:18,cursor:'pointer'}}>{TYPE_ICONS[item.eventType]}</div>
            <div onClick={()=>setSelectedItem(item)} style={{flex:1,cursor:'pointer'}}>
              <div style={{fontWeight:600,fontSize:13,color:G.black}}>{item.title}</div>
              <div style={{fontSize:12,color:G.muted}}>{item.sport} · {item.month} {item.day}{item.time?` · ${item.time}`:''}{item.details?<span> · <LocationLink text={item.details}/></span>:''}</div>
            </div>
            <span style={{fontFamily:"'Oswald',sans-serif",fontSize:10,padding:'2px 7px',borderRadius:4,background:item.eventType==='Game'?G.off:item.eventType==='Practice'?'#e6f4ec':'#fdf3d8',color:item.eventType==='Game'?G.black:item.eventType==='Practice'?G.green:G.gold}}>{item.eventType}</span>
            {canDelete&&<button onClick={async(e)=>{e.stopPropagation();if(window.confirm(`Remove "${item.title}" from the calendar?`)){if(item.eventType==='Game'){await fdb.delete('schedules',item.id);}else{await fdb.delete('events',item.id);}notify('Removed!');}}} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:G.muted,padding:'4px',flexShrink:0}}>🗑</button>}
          </div>)
        }
      </Card>

      {/* Detail popup */}
      {selectedItem&&<Modal title={selectedItem.eventType||'Event'} onClose={()=>setSelectedItem(null)}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
          <div style={{width:52,height:52,borderRadius:10,background:TYPE_BG[selectedItem.eventType]||G.black,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26}}>{TYPE_ICONS[selectedItem.eventType]}</div>
          <div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:600,color:G.black}}>{selectedItem.title}</div>
            <div style={{fontSize:13,color:G.muted,marginTop:2}}>{selectedItem.sport}</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          {[
            {label:'Date',val:`${selectedItem.month} ${selectedItem.day}`},
            {label:'Time',val:selectedItem.time||'TBD'},
            {label:'Location',val:selectedItem.details||'TBD'},
            {label:'Type',val:selectedItem.eventType},
            {label:'Sport',val:selectedItem.sport},
            ...(selectedItem.eventType==='Game'?[{label:'Status',val:selectedItem.score?`Final: ${selectedItem.score}`:selectedItem.liveScore?.live?`LIVE: Vikings ${selectedItem.liveScore.us}–${selectedItem.liveScore.them}`:'Upcoming'},{label:'Location',val:selectedItem.badge==='home'?'Home':'Away'}]:[]),
          ].map(({label,val})=><div key={label} style={{background:G.off,borderRadius:7,padding:'10px 12px'}}>
            <div style={{fontSize:10,fontFamily:"'Oswald',sans-serif",letterSpacing:'1px',textTransform:'uppercase',color:G.muted,marginBottom:3}}>{label}</div>
            <div style={{fontSize:13,fontWeight:600,color:G.black}}>
              {label==='Location'&&val!=='TBD'&&val!=='Home'&&val!=='Away'
                ? <a href={`https://maps.google.com/?q=${encodeURIComponent(val)}`} target="_blank" rel="noopener noreferrer" style={{color:G.blue,textDecoration:'underline'}}>📍 {val}</a>
                : val}
            </div>
          </div>)}
        </div>
        {selectedItem.notes&&<div style={{fontSize:13,color:'#555',background:G.off,borderRadius:7,padding:'10px 12px',marginBottom:14,lineHeight:1.6}}>{selectedItem.notes}</div>}
        {selectedItem.reminder&&selectedItem.reminder!=='none'&&<div style={{fontSize:12,color:'#7A5200',background:G.goldPale,padding:'8px 10px',borderRadius:6,marginBottom:14,lineHeight:1.5}}>⏰ Reminder set: <strong>{{'2hrs':'2 hours before','12hrs':'12 hours before','1day':'1 day before','2days':'2 days before','1week':'1 week before'}[selectedItem.reminder]||selectedItem.reminder}</strong> — Email + SMS to athletes & parents</div>}
        {selectedItem.liveScore?.live&&<div style={{background:G.redBg,borderRadius:8,padding:'12px',textAlign:'center',marginBottom:14}}>
          <div style={{fontSize:10,fontFamily:"'Oswald',sans-serif",letterSpacing:'1px',color:G.red,marginBottom:6}}>● LIVE · {selectedItem.liveScore.quarter}</div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:32,fontWeight:700,color:G.black}}>Vikings {selectedItem.liveScore.us} – {selectedItem.liveScore.them}</div>
        </div>}
        {confirmDelete ? (
          <div>
            <div style={{fontSize:13,color:G.red,background:G.redBg,padding:'10px 12px',borderRadius:6,marginBottom:12,lineHeight:1.5}}>
              ⚠️ Are you sure you want to remove <strong>{selectedItem.title}</strong> from the calendar? This cannot be undone.
            </div>
            <div style={{display:'flex',gap:8}}>
              <Btn variant="danger" onClick={deleteItem}>Yes, Remove</Btn>
              <Btn variant="outline" onClick={()=>setConfirmDelete(false)}>Cancel</Btn>
            </div>
          </div>
        ) : (
          <div style={{display:'flex',gap:8}}>
            <Btn variant="outline" style={{flex:1}} onClick={()=>setSelectedItem(null)}>Close</Btn>
            {canDelete&&<Btn variant="danger" onClick={()=>setConfirmDelete(true)}>🗑 Remove</Btn>}
          </div>
        )}
      </Modal>}

      {/* Add event modal */}
      {addModal&&<Modal title="Add to Calendar" onClose={()=>setAddModal(false)}>
        <div style={{marginBottom:12}}>
          <label style={s.label}>Event Type</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {['Game','Practice','Event'].map(t=><div key={t} onClick={()=>setAf(f=>({...f,eventType:t}))} style={{border:`0.5px solid ${af.eventType===t?(TYPE_BG[t]||G.black):'rgba(0,0,0,0.12)'}`,borderRadius:8,padding:'10px 8px',textAlign:'center',cursor:'pointer',background:af.eventType===t?`${TYPE_BG[t]}22`:G.white}}>
              <div style={{fontSize:20,marginBottom:4}}>{TYPE_ICONS[t]}</div>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:'0.8px',textTransform:'uppercase',color:af.eventType===t?(TYPE_BG[t]||G.black):G.muted}}>{t}</div>
            </div>)}
          </div>
        </div>
        <div style={{marginBottom:12}}><label style={s.label}>Sport</label><select style={s.input} value={af.sport} onChange={e=>setAf(f=>({...f,sport:e.target.value}))}><option value="">Select sport...</option>{(user.role==='coach'&&user.sport?[user.sport]:SPORTS.map(s=>s.key)).map(sp=><option key={sp} value={sp}>{sp}</option>)}</select></div>
        <div style={{marginBottom:12}}><label style={s.label}>{af.eventType==='Game'?'Opponent':'Title'}</label><input style={s.input} placeholder={af.eventType==='Game'?'vs. Lincoln HS':af.eventType==='Practice'?'Practice Session':'Event Name'} value={af.title} onChange={e=>setAf(f=>({...f,title:e.target.value}))}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
          <div><label style={s.label}>Month</label><select style={s.input} value={af.month} onChange={e=>setAf(f=>({...f,month:e.target.value}))}><option value="">Month...</option>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m=><option key={m} value={m}>{m}</option>)}</select></div>
          <div><label style={s.label}>Day</label><select style={s.input} value={af.day} onChange={e=>setAf(f=>({...f,day:e.target.value}))}><option value="">Day...</option>{Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}</select></div>
          <div><label style={s.label}>Time</label><select style={s.input} value={af.time} onChange={e=>setAf(f=>({...f,time:e.target.value}))}><option value="">Time...</option>{['6:00 AM','6:15 AM','6:30 AM','6:45 AM','7:00 AM','7:15 AM','7:30 AM','7:45 AM','8:00 AM','8:15 AM','8:30 AM','8:45 AM','9:00 AM','9:15 AM','9:30 AM','9:45 AM','10:00 AM','10:15 AM','10:30 AM','10:45 AM','11:00 AM','11:15 AM','11:30 AM','11:45 AM','12:00 PM','12:15 PM','12:30 PM','12:45 PM','1:00 PM','1:15 PM','1:30 PM','1:45 PM','2:00 PM','2:15 PM','2:30 PM','2:45 PM','3:00 PM','3:15 PM','3:30 PM','3:45 PM','4:00 PM','4:15 PM','4:30 PM','4:45 PM','5:00 PM','5:15 PM','5:30 PM','5:45 PM','6:00 PM','6:15 PM','6:30 PM','6:45 PM','7:00 PM','7:15 PM','7:30 PM','7:45 PM','8:00 PM','8:15 PM','8:30 PM','8:45 PM','9:00 PM','9:15 PM','9:30 PM','9:45 PM','10:00 PM'].map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        </div>
        <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:500,color:'#888',textTransform:'uppercase',letterSpacing:'0.8px',display:'block',marginBottom:5}}>Details / Location</label><LocationInput value={af.details} onChange={v=>setAf(f=>({...f,details:v}))} placeholder="e.g. Main Gym, 2815 Bikers St..."/></div>
        <div style={{marginBottom:16}}>
          <label style={s.label}>🔔 Send Reminder</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {REMINDER_OPTS.map(opt=><div key={opt.val} onClick={()=>setAf(f=>({...f,reminder:opt.val}))} style={{border:`0.5px solid ${af.reminder===opt.val?G.gold:'rgba(0,0,0,0.12)'}`,borderRadius:8,padding:'10px 12px',cursor:'pointer',background:af.reminder===opt.val?G.goldPale:G.white,display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${af.reminder===opt.val?G.gold:'rgba(0,0,0,0.2)'}`,background:af.reminder===opt.val?G.gold:'transparent',flexShrink:0}}/>
              <span style={{fontSize:13,color:G.black,fontWeight:af.reminder===opt.val?600:400}}>{opt.label}</span>
            </div>)}
          </div>
          {af.reminder!=='none'&&<div style={{fontSize:12,color:'#7A5200',background:G.goldPale,padding:'8px 10px',borderRadius:6,marginTop:8,lineHeight:1.5}}>
            ⏰ Athletes and parents will receive an Email + SMS reminder <strong>{REMINDER_OPTS.find(o=>o.val===af.reminder)?.label}</strong> this event.
          </div>}
        </div>
        <div style={{display:'flex',gap:8}}><Btn variant="primary" onClick={saveEvent}>Add to Calendar</Btn><Btn variant="outline" onClick={()=>setAddModal(false)}>Cancel</Btn></div>
      </Modal>}
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────
  function NotificationsTab() {
    const typeIcons = {absent:'🔴',tardy:'🟡',reminder:'🔔',broadcast:'📢'};
    return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>Notifications</span></div>
      <Card>{myNotifications.length?myNotifications.map(n=><div key={n.id} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:`0.5px solid ${G.off}`}}>
        <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{typeIcons[n.type]||'📩'}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,color:G.black}}>{n.athleteName||'Notification'}</div>
          <div style={{color:G.muted,fontSize:12}}>{n.type} · {n.sport} · {n.date}</div>
          {n.message&&<div style={{fontSize:13,color:'#555',marginTop:2,lineHeight:1.5}}>{n.message}</div>}
          <div style={{fontSize:11,color:G.muted,marginTop:2}}>📧 Email + 📱 SMS sent</div>
        </div>
      </div>):<Empty msg="No notifications yet."/>}</Card>
    </div>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROFILE
  // ─────────────────────────────────────────────────────────────────────────
  function ProfileTab() {
    const [name, setName] = useState(user.name||'');
    const [phone, setPhone] = useState(user.phone||'');
    const [jersey, setJersey] = useState(user.jersey||'');
    const [grade, setGrade] = useState(user.grade||'9th');
    const [sport, setSport] = useState(user.sport||'');
    const [sports, setSports] = useState(user.sports||[user.sport].filter(Boolean));
    const [gradYear, setGradYear] = useState(user.gradYear||'');
    const [sportPlayed, setSportPlayed] = useState(user.sportPlayed||'');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const toggleSport = (sp) => {
      setSports(prev => prev.includes(sp) ? prev.filter(x=>x!==sp) : [...prev, sp]);
    };

    const save = async () => {
      if(!name.trim()){notify('Name is required.');return;}
      setSaving(true);
      try {
        const updates = {
          name: name.trim(),
          phone: phone.trim(),
          ...(user.role==='athlete' ? {jersey, grade, sport: sports[0]||null, sports} : {}),
          ...(user.role==='coach' ? {sport} : {}),
          ...(user.role==='alumni' ? {gradYear, sportPlayed} : {}),
        };
        await updateDoc(doc(db,'users',user.id), updates);
        setSaving(false);
        setSaved(true);
        notify('Profile updated! ✅');
        setTimeout(()=>setSaved(false), 3000);
      } catch(e) {
        notify('Error saving. Please try again.');
        setSaving(false);
      }
    };

    return <div>
      <div style={s.pageHeader}><span style={s.pageTitle}>My Profile</span></div>

      {/* Avatar */}
      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20,background:G.white,borderRadius:10,border:`0.5px solid rgba(0,0,0,0.08)`,padding:'16px 18px'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:G.black,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <span style={{fontFamily:"'Oswald',sans-serif",fontSize:24,fontWeight:700,color:G.gold}}>{(user.name||'?').charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:17,fontWeight:600,color:G.black}}>{user.name}</div>
          <div style={{fontSize:12,color:G.muted,marginTop:2,textTransform:'capitalize'}}>{user.role} · {user.email}</div>
        </div>
      </div>

      <Card>
        <CardTitle>Edit Profile</CardTitle>

        <div style={{marginBottom:12}}><label style={s.label}>Full Name</label><input style={s.input} value={name} onChange={e=>setName(e.target.value)}/></div>
        <div style={{marginBottom:16}}><label style={s.label}>Phone (for SMS alerts)</label><input style={s.input} type="tel" placeholder="(214) 555-0100" value={phone} onChange={e=>setPhone(e.target.value)}/></div>

        {user.role==='athlete'&&<>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <div><label style={s.label}>Jersey #</label><input style={s.input} placeholder="12" value={jersey} onChange={e=>setJersey(e.target.value)}/></div>
            <div><label style={s.label}>Grade</label><select style={s.input} value={grade} onChange={e=>setGrade(e.target.value)}>{['9th','10th','11th','12th'].map(g=><option key={g}>{g}</option>)}</select></div>
          </div>
          <div style={{marginBottom:16}}>
            <label style={s.label}>My Sports</label>
            <div style={{fontSize:12,color:G.muted,marginBottom:8}}>Tap to add or remove. Coaches approve each sport.</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
              {SPORTS.map(sp=>{
                const active = sports.includes(sp.key);
                return <div key={sp.key} onClick={()=>toggleSport(sp.key)} style={{border:`1px solid ${active?G.gold:'rgba(0,0,0,0.1)'}`,borderRadius:8,padding:'8px 4px',textAlign:'center',cursor:'pointer',background:active?G.goldPale:G.white}}>
                  <div style={{fontSize:18,marginBottom:2}}>{sp.icon}</div>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontSize:8,letterSpacing:'0.5px',textTransform:'uppercase',color:active?G.gold:G.muted,lineHeight:1.2}}>{sp.key.replace("Men's","M").replace("Women's","W")}</div>
                </div>;
              })}
            </div>
            {sports.length>0&&<div style={{fontSize:12,color:G.green,marginTop:8,background:G.greenBg,padding:'6px 10px',borderRadius:6}}>✅ {sports.join(', ')}</div>}
          </div>
        </>}

        {user.role==='coach'&&<div style={{marginBottom:16}}><label style={s.label}>Sport</label><select style={s.input} value={sport} onChange={e=>setSport(e.target.value)}><option value="">Select sport...</option>{SPORTS.map(sp=><option key={sp.key} value={sp.key}>{sp.key}</option>)}</select></div>}

        {user.role==='alumni'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
          <div><label style={s.label}>Grad Year</label><input style={s.input} placeholder="2018" value={gradYear} onChange={e=>setGradYear(e.target.value)}/></div>
          <div><label style={s.label}>Sport Played</label><input style={s.input} placeholder="Football" value={sportPlayed} onChange={e=>setSportPlayed(e.target.value)}/></div>
        </div>}

        {saved&&<div style={{background:G.greenBg,color:G.green,fontSize:13,padding:'8px 12px',borderRadius:6,marginBottom:12,textAlign:'center'}}>✅ Profile saved!</div>}

        <Btn variant="primary" style={{width:'100%'}} onClick={save} disabled={saving}>{saving?'Saving...':'Save Changes'}</Btn>
      </Card>

      <Card style={{marginTop:12}}>
        <CardTitle>Password</CardTitle>
        <div style={{fontSize:13,color:G.muted,marginBottom:12}}>To change your password, we'll send a reset link to {user.email}</div>
        <Btn variant="outline" onClick={async()=>{
          try {
            const {getAuth, sendPasswordResetEmail} = await import('firebase/auth');
            await sendPasswordResetEmail(getAuth(), user.email);
            notify('Password reset email sent! Check your inbox.');
          } catch(e){ notify('Error sending reset email.'); }
        }}>Send Password Reset Email</Btn>
      </Card>
    </div>;
  }

  return renderTab();
}