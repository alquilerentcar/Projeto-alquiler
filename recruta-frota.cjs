const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function vehicleQuestion(message) {
  return /(?:carro|ve[ií]culo|placa|polo|gol|voyage|tera)/i.test(message) && /(?:com\s+(?:que|qual)|est[aá]|est[aá]o|ocup|locad|alugad)/i.test(message);
}
function subject(message, history = []) {
  const explicit = message.match(/com\s+(?:que|qual)\s+(?:carro|ve[ií]culo)\s+(?:o\s+|a\s+)?(.+?)(?:\s+est[aá]|\?|$)/i);
  if (explicit && !/^(ele|ela)$/i.test(explicit[1].trim())) return explicit[1].trim();
  for (const item of [...history].reverse()) {
    const name = String(item.content || '').match(/Nome:\s*([^\n]+)/i) || String(item.content || '').match(/^([^\n]+?) est[aá] com /i);
    if (name) return name[1].trim();
  }
  return '';
}
async function currentVehicle(term, request, {url, key, fetcher = fetch}) {
  const company = request.headers['x-empresa-id'];
  if (!company) throw new Error('Selecione a empresa antes de consultar a frota.');
  const read = async (table, params) => {
    const endpoint = new URL(url + '/rest/v1/' + table);
    for (const [name, value] of Object.entries({...params, empresa_id:'eq.' + company})) endpoint.searchParams.set(name, value);
    const response = await fetcher(endpoint, {headers:{apikey:key, Authorization:request.headers.authorization}, signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Não foi possível consultar a ocupação atual da frota.');
    return response.json();
  };
  const words = normalize(term).split(/\s+/).filter(word => word.length > 1 && !['de','da','do','dos','das'].includes(word));
  if (!words.length) return {reply:'Informe o nome ou CPF do locatário para consultar o carro atual.'};
  const digits = String(term).replace(/\D/g, '');
  const clients = await read('clientes', {select:'id,nome_completo,cpf', ...(digits.length === 11 ? {cpf:'eq.'+digits} : {}), limit:'1000'});
  const matches = clients.filter(client => digits.length === 11 ? normalize(client.cpf).replace(/\D/g,'') === digits : words.every(word => normalize(client.nome_completo).includes(word)));
  const imported = await read('frota_levantamento', {select:'cliente_id,responsavel,carro_id,placa,inicio',ativo:'eq.true'});
  const named = imported.filter(row => words.every(word => normalize(row.responsavel).includes(word)));
  if (matches.length > 1 || (!matches.length && named.length > 1)) return {reply:'Encontrei mais de um locatário com esse nome. Informe o nome completo ou CPF.'};
  const client = matches[0];
  if (!client && !named.length) return {reply:'Não encontrei esse locatário nem uma ocupação atual com esse nome nesta empresa.'};
  const [periods, rentals] = client ? await Promise.all([
    read('frota_periodos', {select:'carro_id,inicio,tipo',cliente_id:'eq.'+client.id,fim:'is.null',tipo:'eq.locacao'}),
    read('locacoes', {select:'carro_id,data_inicio',cliente_id:'eq.'+client.id,status:'eq.Ativa'})
  ]) : [[],[]];
  const rows = periods.length ? periods : rentals.length ? rentals.map(row => ({...row,inicio:row.data_inicio})) : imported.filter(row => client ? row.cliente_id === client.id || words.every(word => normalize(row.responsavel).includes(word)) : named.includes(row));
  if (!rows.length) return {reply:(client?.nome_completo || term)+': não encontrei uma ocupação atual registrada nesta empresa.'};
  const ids = [...new Set(rows.map(row => row.carro_id).filter(Boolean))];
  // RLS também protege veículos de outra empresa autorizada usados na operação atual.
  let cars = [];
  if (ids.length) {
    const endpoint = new URL(url+'/rest/v1/carros');
    endpoint.searchParams.set('select','id,placa,modelo'); endpoint.searchParams.set('id','in.('+ids.join(',')+')');
    const response = await fetcher(endpoint,{headers:{apikey:key,Authorization:request.headers.authorization},signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Não foi possível consultar o veículo da ocupação.');
    cars = await response.json();
  }
  return {reply:rows.map(row => {
    const car = cars.find(car => car.id === row.carro_id);
    return `${client?.nome_completo || row.responsavel || term} está com ${car?.modelo || 'o veículo'} — placa ${car?.placa || row.placa || 'não disponível'}.${row.inicio ? '\nInício da ocupação: '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Manaus'}).format(new Date(row.inicio))+'.' : '\nData de início ainda não registrada.'}`;
  }).join('\n\n')};
}
module.exports = {vehicleQuestion, subject, currentVehicle};
