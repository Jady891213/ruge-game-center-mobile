/** Development only. The Android package has no Playwright dependency. */
import {createRequire} from 'node:module';
import {existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
const require=createRequire(import.meta.url);
export function loadPlaywright(){
 const explicit=process.env.PLAYWRIGHT_MODULE||process.env.PLAYWRIGHT_PACKAGE;
 if(explicit)return require(explicit);
 try{return require('playwright');}catch(_){}
 const cache=resolve(homedir(),'.npm/_npx');
 for(const entry of existsSync(cache)?readdirSync(cache):[]){const path=resolve(cache,entry,'node_modules/playwright');if(existsSync(resolve(path,'package.json')))return require(path);}
 throw Error('Install Playwright as a development tool or set PLAYWRIGHT_MODULE to its local package path.');
}
