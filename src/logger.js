// Centralized logger — writes to console + ring buffer in localStorage
// Inspect: window.LEYA_LOGS or open ErrorBoundary "logs" panel

const RING_KEY = "leya_logs";
const RING_SIZE = 200;

function getRing(){
  try{
    const raw=localStorage.getItem(RING_KEY);
    return raw?JSON.parse(raw):[];
  }catch{return [];}
}

function pushRing(entry){
  try{
    const ring=getRing();
    ring.push(entry);
    if(ring.length>RING_SIZE) ring.splice(0, ring.length-RING_SIZE);
    localStorage.setItem(RING_KEY, JSON.stringify(ring));
  }catch{}
}

function fmtData(data){
  if(data===undefined) return "";
  try{
    if(typeof data==="string") return data;
    return JSON.stringify(data, (k,v)=>{
      if(v instanceof Error) return {name:v.name,message:v.message,stack:v.stack?.split("\n").slice(0,5).join("\n")};
      if(typeof v==="function") return "[fn]";
      if(v && typeof v==="object" && v._reactInternalFiber) return "[react element]";
      return v;
    }).slice(0,500);
  }catch{return String(data);}
}

export function log(component, event, data){
  const t=new Date();
  const ts=t.toISOString().slice(11,23);
  const entry={t:ts, c:component, e:event, d:data?fmtData(data):undefined};
  pushRing(entry);
  // Also console output (with color)
  const prefix=`[${ts}] [${component}] ${event}`;
  if(event==="ERROR"||event==="error"||event.includes("error")){
    console.error(prefix, data||"");
  } else if(event.includes("warn")){
    console.warn(prefix, data||"");
  } else {
    console.log(prefix, data||"");
  }
}

export function logError(component, error, ctx){
  log(component, "ERROR", {message:error?.message||String(error), stack:error?.stack?.split("\n").slice(0,3).join(" | "), ctx});
}

export function getLogs(){
  return getRing();
}

export function clearLogs(){
  try{localStorage.removeItem(RING_KEY);}catch{}
}

export function logsAsText(){
  const ring=getRing();
  return ring.map(e=>`[${e.t}] [${e.c}] ${e.e}${e.d?" — "+e.d:""}`).join("\n");
}

// Expose globally for easy debugging
if(typeof window!=="undefined"){
  window.LEYA_LOGS = {get:getLogs, clear:clearLogs, asText:logsAsText};
  // Catch global errors
  window.addEventListener("error", (e)=>{
    log("window", "ERROR", {message:e.message, file:e.filename, line:e.lineno, col:e.colno});
  });
  window.addEventListener("unhandledrejection", (e)=>{
    log("window", "PROMISE_REJECTION", {reason:e.reason?.message||String(e.reason)});
  });
}

// Initial log
log("logger", "init", {time:new Date().toString(), ua:navigator.userAgent.slice(0,50)});
