const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(text){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));}
async function sign(secret,text){const k=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,encoder.encode(text)));}
export async function equalSecret(a,b){return await digest(String(a))===await digest(String(b));}
const encode64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function hashPassword(password,salt=crypto.getRandomValues(new Uint8Array(16))){
 const key=await crypto.subtle.importKey('raw',encoder.encode(String(password)),{name:'PBKDF2'},false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},key,256);
 return {salt:encode64(salt),hash:encode64(bits)};
}
export async function verifyPassword(password,salt,hash){
 if(!salt||!hash)return false;
 const actual=await hashPassword(password,decode64(salt));return equalSecret(actual.hash,hash);
}
export async function issueSession(env,role='resource_admin',userId='system',now=Math.floor(Date.now()/1000)){
 if(typeof userId==='number'){now=userId;userId='system';}
 if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)throw new Error('会话密钥尚未配置');
 const payload=`${role}.${userId}.${now+8*3600}`;return `${payload}.${await sign(env.ADMIN_SESSION_SECRET,payload)}`;
}
export async function readSession(request,env,now=Math.floor(Date.now()/1000)){
 if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)return null;
 const token=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)wb_session=([^;]+)/)?.[1]||'';
 const [role,userId,exp,sig,...extra]=token.split('.');
 if(extra.length||!['super_admin','resource_admin','user'].includes(role)||!/^[A-Za-z0-9-]{1,64}$/.test(userId||'')||!/^\d+$/.test(exp||'')||+exp<=now||+exp>now+8*3600)return null;
 if(!await equalSecret(sig,await sign(env.ADMIN_SESSION_SECRET,`${role}.${userId}.${exp}`)))return null;
 return {role,userId};
}
export function sameOrigin(request){const origin=request.headers.get('Origin');return origin===new URL(request.url).origin;}
export function sessionCookie(token,maxAge=28800){return `wb_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
