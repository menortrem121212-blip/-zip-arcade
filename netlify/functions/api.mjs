const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const env = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.ADMIN_PASSWORD;
  if (!url || !key || !password) throw new Error("Netlify ainda não foi configurado: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e ADMIN_PASSWORD são obrigatórios.");
  return {url:key?url.replace(/\/$/,""):url,key,password};
};
const sb = async (path, options={}) => {
  const {url,key}=env();
  const r=await fetch(url+path,{...options,headers:{
    apikey:key, Authorization:`Bearer ${key}`,
    ...(options.headers||{})
  }});
  const text=await r.text();
  let body; try{body=text?JSON.parse(text):null}catch{body=text}
  if(!r.ok) throw new Error(body?.message||body?.error||body?.msg||`Supabase HTTP ${r.status}`);
  return body;
};
const requireAdmin = req => {
  const {password}=env();
  return req.headers.get("x-admin-password")===password;
};
const cors = r => { r.headers.set("access-control-allow-origin","*"); return r; };

export default async (req) => {
  try {
    const url=new URL(req.url);
    const path=url.pathname.replace(/^\/api/,"")||"/";

    if(req.method==="OPTIONS") return new Response("",{status:204,headers:{
      "access-control-allow-origin":"*","access-control-allow-headers":"content-type,x-admin-password","access-control-allow-methods":"GET,POST,OPTIONS"
    }});

    if(path==="/games" && req.method==="GET"){
      const rows=await sb(`/rest/v1/games?select=id,name,version,published,updated_at&published=eq.true&order=updated_at.desc`);
      return cors(json({games:rows}));
    }

    if(path==="/game-url" && req.method==="GET"){
      const id=url.searchParams.get("id");
      if(!id) return cors(json({error:"ID ausente."},400));
      const rows=await sb(`/rest/v1/games?select=id,name,version,storage_path,published&id=eq.${encodeURIComponent(id)}&published=eq.true&limit=1`);
      if(!rows?.length) return cors(json({error:"Jogo não encontrado."},404));
      const pathValue=rows[0].storage_path.split("/").map(encodeURIComponent).join("/");
      const signed=await sb(`/storage/v1/object/sign/zip-arcade/${pathValue}`,{
        method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expiresIn:600})
      });
      const token=signed?.signedURL||signed?.signedUrl;
      if(!token) throw new Error("Não foi possível criar URL temporária.");
      return cors(json({url:token.startsWith("http")?token:`${env().url}/storage/v1${token}`,name:rows[0].name,version:rows[0].version}));
    }

    if(path==="/admin/check" && req.method==="POST"){
      const body=await req.json().catch(()=>({}));
      const {password}=env();
      if(body.password!==password) return cors(json({error:"Senha incorreta."},401));
      return cors(json({ok:true}));
    }

    if(path==="/admin/games" && req.method==="GET"){
      if(!requireAdmin(req)) return cors(json({error:"Não autorizado."},401));
      const rows=await sb(`/rest/v1/games?select=id,name,version,published,storage_path,updated_at&order=updated_at.desc`);
      return cors(json({games:rows}));
    }

    if(path==="/admin/upload-url" && req.method==="POST"){
      if(!requireAdmin(req)) return cors(json({error:"Não autorizado."},401));
      const body=await req.json().catch(()=>({}));
      const id=body.gameId || crypto.randomUUID();
      const version=Date.now();
      const storagePath=`games/${id}/v${version}.zip`;
      const signed=await sb(`/storage/v1/object/upload/sign/zip-arcade/${storagePath}`,{
        method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({upsert:false})
      });
      const token=signed?.token;
      if(!token) throw new Error("Supabase não retornou token de upload.");
      const uploadUrl=`${env().url}/storage/v1/object/upload/sign/zip-arcade/${storagePath}?token=${encodeURIComponent(token)}`;
      return cors(json({id,storagePath,uploadUrl,version}));
    }

    if(path==="/admin/publish" && req.method==="POST"){
      if(!requireAdmin(req)) return cors(json({error:"Não autorizado."},401));
      const body=await req.json().catch(()=>({}));
      if(!body.id||!body.name||!body.storagePath) return cors(json({error:"Dados incompletos."},400));
      const existing=await sb(`/rest/v1/games?select=id,version,storage_path&id=eq.${encodeURIComponent(body.id)}&limit=1`);
      const version=existing?.length ? Number(existing[0].version||1)+1 : 1;
      await sb(`/rest/v1/games?on_conflict=id`,{
        method:"POST",headers:{"content-type":"application/json","prefer":"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify({id:body.id,name:String(body.name).slice(0,100),storage_path:body.storagePath,version,published:true,updated_at:new Date().toISOString()})
      });
      if(body.oldPath && body.oldPath!==body.storagePath){
        const old=body.oldPath.split("/").map(encodeURIComponent).join("/");
        await sb(`/storage/v1/object/zip-arcade`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({prefixes:[body.oldPath]})}).catch(()=>{});
      }
      return cors(json({ok:true,version}));
    }

    if(path==="/admin/delete" && req.method==="POST"){
      if(!requireAdmin(req)) return cors(json({error:"Não autorizado."},401));
      const body=await req.json().catch(()=>({}));
      if(!body.id) return cors(json({error:"ID ausente."},400));
      const rows=await sb(`/rest/v1/games?select=id,storage_path&id=eq.${encodeURIComponent(body.id)}&limit=1`);
      if(!rows?.length) return cors(json({error:"Jogo não encontrado."},404));
      await sb(`/rest/v1/games?id=eq.${encodeURIComponent(body.id)}`,{method:"DELETE"});
      if(rows[0].storage_path){
        await sb(`/storage/v1/object/zip-arcade`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({prefixes:[rows[0].storage_path]})}).catch(()=>{});
      }
      return cors(json({ok:true}));
    }

    return cors(json({error:"Rota não encontrada."},404));
  } catch(e) {
    return cors(json({error:e?.message||"Erro interno."},500));
  }
};
export const config={path:"/api/*"};
