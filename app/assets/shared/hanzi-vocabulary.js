/* Shared original 60-character vocabulary. The library describes this set; it does not infer mastery from group scores. */
(function(w){
'use strict';
const levels=[
  { name:'第一关', chars:'这那说着是的只个成就' },
  { name:'第二关', chars:'看为什么我和你他哪里' },
  { name:'第三关', chars:'来去又要还能起儿子也' },
  { name:'第四关', chars:'都没不可以大小少多过' },
  { name:'第五关', chars:'一二三方对面到好了有' },
  { name:'第六关', chars:'天地人们山日出上中下' },
];
const pinyin={
  '这':['zhè'],'那':['nà'],'说':['shuō','shuì'],'着':['zhe','zháo','zhuó','zhāo'],'是':['shì'],'的':['de'],
  '只':['zhǐ','zhī'],'个':['gè'],'成':['chéng'],'就':['jiù'],'看':['kàn','kān'],
  '为':['wèi','wéi'],'什':['shén'],'么':['me'],'我':['wǒ'],'和':['hé','hè','huó','huò','hú'],'你':['nǐ'],
  '他':['tā'],'哪':['nǎ','něi'],'里':['lǐ'],'来':['lái'],'去':['qù'],'又':['yòu'],
  '要':['yào'],'还':['hái','huán'],'能':['néng'],'起':['qǐ'],'儿':['ér'],'子':['zǐ'],
  '也':['yě'],'都':['dōu','dū'],'没':['méi','mò'],'不':['bù'],'可':['kě'],'以':['yǐ'],
  '大':['dà'],'小':['xiǎo'],'少':['shǎo','shào'],'多':['duō'],'过':['guò'],
  '一':['yī'],'二':['èr'],'三':['sān'],'方':['fāng'],'对':['duì'],'面':['miàn'],
  '到':['dào'],'好':['hǎo','hào'],'了':['le','liǎo'],'有':['yǒu'],'天':['tiān'],
  '地':['dì','de'],'人':['rén'],'们':['men'],'山':['shān'],'日':['rì'],'出':['chū'],
  '上':['shàng'],'中':['zhōng','zhòng'],'下':['xià'],
};
const themes=['常用表达','日常对话','动作与称呼','多少大小','数字与位置','天地自然'];
levels.forEach(Object.freeze);Object.values(pinyin).forEach(Object.freeze);
w.HanziVocabulary=Object.freeze({levels:Object.freeze(levels),pinyin:Object.freeze(pinyin),themes:Object.freeze(themes)});
})(window);
