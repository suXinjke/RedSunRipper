const SCALE = 0.05;

import fs = require( 'fs' )

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
    origin: Vector,
    reflection: Vector,

    vertexes: Vertex[],
    faces: Face[]
}

const modelParts: ModelPart[] = []

function PSXPointerToOffset( slice: Buffer | number ) {
    if ( typeof slice === 'number' ) {
        slice = Buffer.from( slice.toString( 16 ) )
    }

    return Number( `0x${slice.swap32().toString( 'hex', 1, 4 )}` )
}

function extractPSXPointer( offset: number ) {
    return PSX_MEM.slice( offset, offset + 4 )
}

function extractPSXPointerAndGetOffset( offset: number ) {
    return PSXPointerToOffset( extractPSXPointer( offset ) )
}

const PSX_MEM = fs.readFileSync( 'psx.cem' )

const SELECTED_SHIP = extractPSXPointerAndGetOffset( 0x1A75A8 )
const SHIP = extractPSXPointerAndGetOffset( SELECTED_SHIP + 0x40 )

const MODEL = extractPSXPointerAndGetOffset( SHIP + 0x58 )
const MODEL_PARTS = extractPSXPointerAndGetOffset( SELECTED_SHIP + 0x60 )
const MODEL_PART_SIZE = 0x60

function parseModel( offset, index ) {

    console.log( `parsing model with index ${index}, offset ${offset}` )

    const MODEL_PART_START = MODEL_PARTS + MODEL_PART_SIZE * index
    const PARENT_MODEL_PART_START = extractPSXPointerAndGetOffset( MODEL_PART_START + 0x10 )

    const PARENT_INDEX = index === 0 ? undefined : PSX_MEM.readInt32LE( PARENT_MODEL_PART_START + 0x8 )

    const modelPart: ModelPart = {
        index,
        origin: {
            x: PSX_MEM.readInt32LE( MODEL_PART_START + 0x30 ) * SCALE,
            y: PSX_MEM.readInt32LE( MODEL_PART_START + 0x34 ) * SCALE,
            z: PSX_MEM.readInt32LE( MODEL_PART_START + 0x38 ) * SCALE
        },
        reflection: {
            x: index === 0 || PSX_MEM.readInt16LE( MODEL_PART_START + 0x1C ) >= 0 ? 1 : -1,
            y: index === 0 || PSX_MEM.readInt16LE( MODEL_PART_START + 0x1E ) >= 0 ? 1 : -1,
            z: index === 0 || PSX_MEM.readInt16LE( MODEL_PART_START + 0x2C ) >= 0 ? 1 : -1
        },
        faces: [],
        vertexes: []
    }

    if ( PARENT_INDEX !== undefined ) {
        modelPart.origin.x += modelParts[PARENT_INDEX].origin.x;
        modelPart.origin.y += modelParts[PARENT_INDEX].origin.y;
        modelPart.origin.z += modelParts[PARENT_INDEX].origin.z;
    }

    const AMOUNT_OF_VERTEXES = PSX_MEM.readUInt32LE( offset + 0x24 );
    const VERTEX_OFFSET = extractPSXPointerAndGetOffset( offset + 0x28 );
    const VERTEX_SIZE = 8;
    
    for ( let i = 0 ; i < AMOUNT_OF_VERTEXES * VERTEX_SIZE ; i += VERTEX_SIZE ) {
        modelPart.vertexes.push( {
            x: PSX_MEM.readInt16LE( VERTEX_OFFSET + i ) * SCALE * modelPart.reflection.x,
            y: PSX_MEM.readInt16LE( VERTEX_OFFSET + i + 2 ) * SCALE * modelPart.reflection.y,
            z: PSX_MEM.readInt16LE( VERTEX_OFFSET + i + 4 ) * SCALE * modelPart.reflection.z
        } )
    }

    const AMOUNT_OF_FACES = PSX_MEM.readUInt32LE( offset + 0x34 );
    const FACE_OFFSET = extractPSXPointerAndGetOffset( offset + 0x3c );
    
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

    modelParts.push( modelPart )

    const NEXT_MODEL = extractPSXPointerAndGetOffset( offset );

    if ( NEXT_MODEL > 0 ) {
        parseModel( NEXT_MODEL, index + 1 )
    }
}

parseModel( MODEL, 0 )

function writeModel() {
    let fileContents = `o Object\n`

    let vertex_offset = 0;

    modelParts.forEach( modelPart => {
        const { vertexes, faces } = modelPart

        fileContents += vertexes.reduce( ( result, elem ) => {
            return result + `v ${elem.x + modelPart.origin.x} ${elem.y + modelPart.origin.y} ${elem.z + modelPart.origin.z}\n`
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

writeModel()

