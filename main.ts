import { parseShip, modelPartsToObjFile } from './parse'
import { parseSaveState } from './sstate'
import { makeTexture } from './util'
import * as fs from 'fs'

async function main() {
    const saveState = parseSaveState( './sstate.cem' )
    const modelParts = parseShip( saveState.PSX_MEM );
    
    const obj = modelPartsToObjFile( modelParts, 0.1 )
    fs.writeFileSync( "out.obj", obj );
}
    
main();