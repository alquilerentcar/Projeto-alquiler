import test from 'node:test';import assert from 'node:assert/strict';
import {addPhotosToGroup,photoGroupMetadata,substitutionPhotoDescriptors} from '../substituicao-fotos.mjs';
const file=(name,type='image/jpeg',size=20)=>({name,type,size,lastModified:1});
test('grupos separados, seleções adicionais, remoção e limite compartilhado',()=>{
 let groups={anterior:[],posterior:[]};groups=addPhotosToGroup(groups,'anterior',[file('a.jpg')],3);groups=addPhotosToGroup(groups,'posterior',[file('b.jpg')],3);groups=addPhotosToGroup(groups,'anterior',[file('a.jpg'),file('c.jpg')],3);
 assert.equal(groups.anterior.length,2);assert.equal(groups.posterior.length,1);assert.throws(()=>addPhotosToGroup(groups,'posterior',[file('d.jpg')],3),/compartilhado/);assert.throws(()=>addPhotosToGroup(groups,'posterior',[file('a.jpg')],4),/outro veículo/);
 assert.deepEqual(photoGroupMetadata(groups),{versao:1,anterior:2,posterior:1});assert.throws(()=>photoGroupMetadata({anterior:[],posterior:[file('b.jpg')]}),/pelo menos/);assert.throws(()=>addPhotosToGroup(groups,'anterior',[file('a.pdf','application/pdf')],5),/JPG/);
});
test('PDF identifica devolução e entrega, com numeração e placa próprias',()=>{
 const doc={fotos:3,valores:{fotos_grupos:{versao:1,anterior:2,posterior:1}},snapshot:{anterior:{placa:'OLD1234'},posterior:{placa:'NEW5678'}}};const photos=substitutionPhotoDescriptors(doc);
 assert.deepEqual(photos.map(p=>p.index),[1,2,3]);assert(photos[0].title.includes('substituído (devolução) OLD1234'));assert(photos[1].title.endsWith('foto 2 de 2'));assert(photos[2].title.includes('substituto (entrega) NEW5678'));assert(photos[2].title.endsWith('foto 1 de 1'));
 assert.throws(()=>substitutionPhotoDescriptors({...doc,fotos:4}),/inconsistente/);
});
test('termos antigos e conversão para permanente preservam a classificação original',()=>{
 const snapshot={anterior:{placa:'OLD1234'},posterior:{placa:'NEW5678'}};
 const legacy=substitutionPhotoDescriptors({fotos:2,snapshot,valores:{}});assert(legacy.every(p=>p.grupo==='posterior'));assert(legacy[0].title.endsWith('foto 1 de 2'));
 const valores={fotos_grupos:{versao:1,anterior:1,posterior:1},conversao_sem_troca_fisica:true};assert.deepEqual(substitutionPhotoDescriptors({fotos:2,snapshot,valores}).map(p=>p.grupo),['anterior','posterior']);
});
