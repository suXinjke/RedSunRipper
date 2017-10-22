import { parseShip, modelPartsToObjFile } from './parse'
import { parseSaveState } from './sstate'
import { makeTexture } from './util'
import * as fs from 'fs'

function main() {

    const saveStatePath = process.argv[2]
    if ( !saveStatePath ) {
        console.log( 'ePSXe save state has not been provided' );
        process.exit( 0 );
    }

    const saveState = parseSaveState( saveStatePath )
    const modelParts = parseShip( saveState.PSX_MEM );
    
    const obj = modelPartsToObjFile( modelParts, 0.1 )
    fs.writeFileSync( "out.obj", obj );
}
    
try {
    main();
} catch ( e ) {
    console.log( e )
}