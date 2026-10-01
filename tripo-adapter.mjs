// Deliberately inert boundary: no fetch, credential reads or provider imports.
// A future server-only adapter needs explicit image scope and a total cost cap,
// durable request IDs and a task ledger before any upload or paid creation.
export const tripoStatus=()=>({enabled:false,state:'disabled',reason:'未确认上传图片与费用上限',credentialsRead:false,requestsSent:0});
export const denyTripoRequest=()=>({enabled:false,state:'blocked',error:'Tripo 未启用：请先确认上传范围和预算。当前版本不会发送请求。'});
