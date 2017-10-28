import { parseShip, writeModelPartsToObjFile } from './parse'
import { parseSaveState } from './sstate'
import { makePNGTexture, getAllTextures, doesFaceBelongToTexture, Texture } from './texture'
import * as fs from 'fs'

async function main() {

    if ( process.argv.length < 3 ) {
        console.log( `Colony Wars Red Sun - player ship ripper` );
        console.log( `Make an ePSXe save state while at player's ship preview menu and provide save state file as input` );
        console.log( `Both compressed and uncompressed ePSXe save states are supported` );
        console.log( `` );
        console.log( `main.js <ePSXe save state file> [output directory]` );
        process.exit( 0 );
    }
    const saveStatePath = process.argv[2]
    
    const outputDirectory = process.argv[3] || './output'
    if ( !fs.existsSync( outputDirectory ) ) {
        fs.mkdirSync( outputDirectory );
    }

    const saveState = parseSaveState( saveStatePath )
    const { PSX_MEM, V_MEM } = saveState

    const shipParts = parseShip( PSX_MEM )
    const textures = getAllTextures( PSX_MEM, V_MEM )

    const objFile = writeModelPartsToObjFile( shipParts, textures, 0.1, V_MEM, outputDirectory );
}
    
try {
    main();
} catch ( e ) {
    console.log( e )
}