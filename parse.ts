import fs = require( 'fs' )
import { extractPSXPointer, extractPSXPointerAndGetOffset } from './util'

interface Vector {
    x: number,
    y: number,
    z: number
}

type Vertex = Vector

interface Face {
    vertexes: number,
    header: number,
    v1: number,
    v2: number,
    v3: number,
    v4: number
}

interface ModelPart {
    index: number,
    next_model: number,
    parent_index: number,
    origin_rel_to_parent: Vector,
    reflection: Vector,

    vertexes: Vertex[],
    faces: Face[]
}

function parseModel( PSX_MEM: Buffer, modelOffset: number, modelPartsOffset: number, index: number = 0 ): ModelPart {

    console.log( `parsing model with index ${index}, offset ${modelOffset}` )

    const PARENT_MODEL_PART_START = extractPSXPointerAndGetOffset( PSX_MEM, modelPartsOffset + 0x10 )
    const PARENT_INDEX = index === 0 ? undefined : PSX_MEM.readInt32LE( PARENT_MODEL_PART_START + 0x8 )

    const modelPart: ModelPart = {
        index,
        parent_index: index === 0 ? undefined : PSX_MEM.readInt32LE( PARENT_MODEL_PART_START + 0x8 ),
        next_model: extractPSXPointerAndGetOffset( PSX_MEM, modelOffset ),
        origin_rel_to_parent: {
            x: PSX_MEM.readInt32LE( modelPartsOffset + 0x30 ),
            y: PSX_MEM.readInt32LE( modelPartsOffset + 0x34 ),
            z: PSX_MEM.readInt32LE( modelPartsOffset + 0x38 )
        },
        reflection: {
            x: index === 0 || PSX_MEM.readInt16LE( modelPartsOffset + 0x1C ) >= 0 ? 1 : -1,
            y: index === 0 || PSX_MEM.readInt16LE( modelPartsOffset + 0x1E ) >= 0 ? 1 : -1,
            z: index === 0 || PSX_MEM.readInt16LE( modelPartsOffset + 0x2C ) >= 0 ? 1 : -1
        },
        faces: [],
        vertexes: []
    }

    const AMOUNT_OF_VERTEXES = PSX_MEM.readUInt32LE( modelOffset + 0x24 );
    const VERTEX_OFFSET = extractPSXPointerAndGetOffset( PSX_MEM, modelOffset + 0x28 );
    const VERTEX_SIZE = 8;
    
    for ( let i = 0 ; i < AMOUNT_OF_VERTEXES * VERTEX_SIZE ; i += VERTEX_SIZE ) {
        modelPart.vertexes.push( {
            x: PSX_MEM.readInt16LE( VERTEX_OFFSET + i ) * modelPart.reflection.x,
            y: PSX_MEM.readInt16LE( VERTEX_OFFSET + i + 2 ) * modelPart.reflection.y,
            z: PSX_MEM.readInt16LE( VERTEX_OFFSET + i + 4 ) * modelPart.reflection.z
        } )
    }

    const AMOUNT_OF_FACES = PSX_MEM.readUInt32LE( modelOffset + 0x34 );
    const FACE_OFFSET = extractPSXPointerAndGetOffset( PSX_MEM, modelOffset + 0x3c );
    
    for ( let i = 0, j = FACE_OFFSET ; i < AMOUNT_OF_FACES ; i++ ) {
        const header = PSX_MEM.readInt16LE( j )

        modelPart.faces.push( {
            vertexes: [ 3128, 18785, 2336, 3193 ].indexOf( header ) !== -1 ? 3 : 4,
            header,
            v1: PSX_MEM.readInt16LE( j + 2 ),
            v2: PSX_MEM.readInt16LE( j + 4 ),
            v3: PSX_MEM.readInt16LE( j + 6 ),
            v4: PSX_MEM.readInt16LE( j + 8 ),
        } )
        
        if ( header === 3900 ) {
            j += 30;
        } else if ( header === 3128 ) {
            j += 24;
        } else if ( header === 19301 ) {
            j += 22;
        } else if ( header === 18785 ) {
            j += 18;
        } else if ( header === 2336 ) {
            j += 18;
        } else if ( header === 2852 ) {
            j += 22;
        } else if ( header === -28868 ) {
            j += 30
        } else if ( header === 3965 ) {
            j += 30
        } else if ( header === 3193 ) {
            j += 24
        } else {
            throw new Error( `Weird face with header ${header}, address is ${ j.toString( 16 ) }` )
        }
    }

    return modelPart
}


export function parseShip( PSX_MEM: Buffer ): ModelPart[] {
    const modelParts: ModelPart[] = []

    const SELECTED_SHIP = extractPSXPointerAndGetOffset( PSX_MEM, 0x1A75A8 )
    const SHIP = extractPSXPointerAndGetOffset( PSX_MEM, SELECTED_SHIP + 0x40 )
    const MODEL_PARTS = extractPSXPointerAndGetOffset( PSX_MEM, SELECTED_SHIP + 0x60 )

    let index = 0;
    let NEXT_MODEL = extractPSXPointerAndGetOffset( PSX_MEM, SHIP + 0x58 )
    let NEXT_MODEL_PART = MODEL_PARTS;

    while ( NEXT_MODEL ) {
        const modelPart = parseModel( PSX_MEM, NEXT_MODEL, NEXT_MODEL_PART, index )
        modelParts.push( modelPart )
        
        NEXT_MODEL = modelPart.next_model
        NEXT_MODEL_PART += 0x60

        index++;
    }

    return modelParts
}

export function writeModel( modelParts: ModelPart[], SCALE: number = 1 ) {
    
    let vertex_offset = 0;
    let fileContents = ''
    
    modelParts.forEach( ( modelPart, index ) => {

        fileContents += `o Object ${index+1}\n`

        const { vertexes, faces } = modelPart

        fileContents += vertexes.reduce( ( result, elem ) => {
            let parent = modelParts[modelPart.parent_index]
            while ( parent !== undefined ) {
                elem.x += modelPart.origin_rel_to_parent.x;
                elem.y += modelPart.origin_rel_to_parent.y;
                elem.z += modelPart.origin_rel_to_parent.z;
                parent = modelParts[parent.parent_index];
            }
            return result + `v ${elem.x * SCALE} ${elem.y * SCALE} ${elem.z * SCALE}\n`
        }, "" )
    
        fileContents += faces.reduce( ( result, elem ) => {
            if ( elem.vertexes === 3 ) {
                return result + `f ${elem.v1 + vertex_offset + 1} ${elem.v2 + vertex_offset + 1} ${elem.v3 + vertex_offset + 1}\n`
            } else {
                return result + `f ${elem.v1 + vertex_offset + 1} ${elem.v2 + vertex_offset + 1} ${elem.v3 + vertex_offset + 1} ${elem.v4 + vertex_offset + 1}\n`
            }
        }, "" )
    
        vertex_offset += modelPart.vertexes.length
    } )
    
    fs.writeFileSync( "out.obj", fileContents );
}