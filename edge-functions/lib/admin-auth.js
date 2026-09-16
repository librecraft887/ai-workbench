const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(text){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));}
async function sign(secret,text){const k=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,encoder.encode(text)));}
export async function equalSecret(a,b){return await digest(String(a))===await digest(String(b));}
export async function issueSession(env,role='admin',now=Math.floor(Date.now()/1000)){
 if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)throw new Error('会话密钥尚未配置');
 const payload=`${role}.${now+8*3600}`;return `${payload}.${await sign(env.ADMIN_SESSION_SECRET,payload)}`;
}
export async function readSession(request,env,now=Math.floor(Date.now()/1000)){
 if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)return null;
 const token=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)wb_session=([^;]+)/)?.[1]||'';
 const [role,exp,sig,...extra]=token.split('.');
 if(extra.length||!['admin','user'].includes(role)||!/^\d+$/.test(exp||'')||+exp<=now||+exp>now+8*3600)return null;
 if(!await equalSecret(sig,await sign(env.ADMIN_SESSION_SECRET,`${role}.${exp}`)))return null;
 return {role};
}
export function sameOrigin(request){const origin=request.headers.get('Origin');return origin===new URL(request.url).origin;}
export function sessionCookie(token,maxAge=28800){return `wb_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
