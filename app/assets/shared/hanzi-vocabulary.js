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
const practiceLevels=levels.concat([{"name": "你我他", "chars": "你我他人们和"}, {"name": "这里那里", "chars": "这那哪里个方"}, {"name": "天上地下", "chars": "天地山日上下"}, {"name": "大小多少", "chars": "大小多少一二"}, {"name": "来来去去", "chars": "来去出到过起"}, {"name": "问一问", "chars": "为什么哪说看"}, {"name": "会说话", "chars": "说着是的了么"}, {"name": "一家人", "chars": "儿子我你他们"}, {"name": "好朋友", "chars": "你好我和他也"}, {"name": "方向角", "chars": "上中下方面里"}, {"name": "一二三", "chars": "一二三个多少"}, {"name": "能不能", "chars": "能不可还有要"}, {"name": "有和没有", "chars": "有没是不的也"}, {"name": "看着说", "chars": "看说着对好了"}, {"name": "位置找找", "chars": "这那上下面里"}, {"name": "自然小队", "chars": "天日山地人出"}, {"name": "小小对话", "chars": "我你说么是的"}, {"name": "走走看看", "chars": "来去到看过了"}, {"name": "一起长大", "chars": "大小儿子成人"}, {"name": "再来一次", "chars": "又来还要一过"}, {"name": "数字方位", "chars": "一二三上中下"}, {"name": "你在哪里", "chars": "你是哪里我那"}, {"name": "我们一起", "chars": "我你他们和来"}, {"name": "好多东西", "chars": "好多少个大小"}, {"name": "会不会呢", "chars": "能不可以还么"}, {"name": "这里有山", "chars": "这里有山天地"}, {"name": "说说看", "chars": "说看着了什么"}, {"name": "对面有人", "chars": "对面有人们好"}, {"name": "日出山上", "chars": "日出山上天下"}, {"name": "回顾挑战", "chars": "成就为都过方"}]);
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
levels.forEach(Object.freeze);practiceLevels.forEach(Object.freeze);Object.values(pinyin).forEach(Object.freeze);
w.HanziVocabulary=Object.freeze({levels:Object.freeze(levels),practiceLevels:Object.freeze(practiceLevels),pinyin:Object.freeze(pinyin),themes:Object.freeze(themes)});
})(window);
