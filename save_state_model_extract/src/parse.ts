import { dereferencePSXPointer } from './util'
import { Texture, doesFaceBelongToTexture, makePNGTexture } from './texture'
import { Pixel } from './sstate'
import * as fs from 'fs'

interface Vector {
    x: number,
    y: number,
    z: number
}

type Vertex = Vector

interface FaceVertex {
    index: number,
    uv_x: number,
    uv_y: number
}

export interface Face {
    texture_page_index: number,
    vertexes: FaceVertex[]
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

    const PARENT_MODEL_PART_START = dereferencePSXPointer( PSX_MEM, modelPartsOffset + 0x10 )
    const PARENT_INDEX = index === 0 ? undefined : PSX_MEM.readInt32LE( PARENT_MODEL_PART_START + 0x8 )

    const modelPart: ModelPart = {
        index,
        parent_index: index === 0 ? undefined : PSX_MEM.readInt32LE( PARENT_MODEL_PART_START + 0x8 ),
        next_model: dereferencePSXPointer( PSX_MEM, modelOffset ),
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
    const VERTEX_OFFSET = dereferencePSXPointer( PSX_MEM, modelOffset + 0x28 );
    const VERTEX_SIZE = 8;
    
    for ( let i = 0 ; i < AMOUNT_OF_VERTEXES * VERTEX_SIZE ; i += VERTEX_SIZE ) {
        modelPart.vertexes.push( {
            x: PSX_MEM.readInt16LE( VERTEX_OFFSET + i ) * modelPart.reflection.x,
            y: PSX_MEM.readInt16LE( VERTEX_OFFSET + i + 2 ) * modelPart.reflection.y,
            z: PSX_MEM.readInt16LE( VERTEX_OFFSET + i + 4 ) * modelPart.reflection.z
        } )
    }

    const AMOUNT_OF_FACES = PSX_MEM.readUInt32LE( modelOffset + 0x34 );
    const FACE_OFFSET = dereferencePSXPointer( PSX_MEM, modelOffset + 0x3c );

    for ( let i = 0, j = FACE_OFFSET ; i < AMOUNT_OF_FACES ; i++ ) {
        const header = PSX_MEM.readInt16LE( j )

        const offsets: { texture_page: number, uv: number } =
            header === 2852 ? { texture_page: 0xC,  uv: 0xE } :
            header === 18785 ? { texture_page: 0xA,  uv: 0xC } :
            header === 2336  ? { texture_page: 0xA,  uv: 0xC } :
            header === 3128  ? { texture_page: 0x10, uv: 0x12 } :
            header === 3193  ? { texture_page: 0xF, uv: 0x10 } :
            header === 19301 ? { texture_page: 0xC,  uv: 0xE } :
            { texture_page: 0x14, uv: 0x16 } // 3900, 3965, -28868

        const texture_page_index = PSX_MEM.readUInt16LE( j + offsets.texture_page ) % 32

        const is_tri = [ 3128, 18785, 2336, 3193 ].includes( header )

        const vertexes: FaceVertex[] = [
            {
                index: PSX_MEM.readInt16LE( j + 2 ),
                uv_x: PSX_MEM.readUInt8( j + offsets.uv + 0 ),
                uv_y: PSX_MEM.readUInt8( j + offsets.uv + 1 ),
            },
            {
                index: PSX_MEM.readInt16LE( j + 4 ),
                uv_x: PSX_MEM.readUInt8( j + offsets.uv + 2 ),
                uv_y: PSX_MEM.readUInt8( j + offsets.uv + 3 )
            },
            {
                index: PSX_MEM.readInt16LE( j + 6 ),
                uv_x: PSX_MEM.readUInt8( j + offsets.uv + 4 ),
                uv_y: PSX_MEM.readUInt8( j + offsets.uv + 5 )
            }
        ].concat(
            is_tri ? [] : [
                {
                    index: PSX_MEM.readInt16LE( j + 8 ),
                    uv_x: PSX_MEM.readUInt8( j + offsets.uv + 6 ),
                    uv_y: PSX_MEM.readUInt8( j + offsets.uv + 7 )
                }
            ]
        )
        
        // TODO: these struct sizes could be merged with 'offsets' object above
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

        const faceHasDuplicateVertexes = vertexes.map( elem => elem.index )
            .filter( ( vertex, index, self ) => index === self.indexOf( vertex ) )
            .length !== vertexes.length

        if ( !faceHasDuplicateVertexes ) {
            modelPart.faces.push( { texture_page_index, vertexes } )
        }
    }

    console.log( `Ripped model part ${index} at ${modelOffset.toString( 16 )}, vertexes: ${AMOUNT_OF_VERTEXES}, faces: ${AMOUNT_OF_FACES}` )

    return modelPart
}


export function parseShip( PSX_MEM: Buffer ): ModelPart[] {
    const modelParts: ModelPart[] = []

    const SELECTED_SHIP = dereferencePSXPointer( PSX_MEM, 0x1A75A8 )
    const SHIP = dereferencePSXPointer( PSX_MEM, SELECTED_SHIP + 0x40 )
    const MODEL_PARTS = dereferencePSXPointer( PSX_MEM, SELECTED_SHIP + 0x60 )

    let index = 0;
    let NEXT_MODEL = dereferencePSXPointer( PSX_MEM, SHIP + 0x58 )
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

export async function writeModelPartsToObjFile( modelParts: ModelPart[], textures: Texture[], SCALE: number = 1, V_MEM: Pixel[][], dirPath: string ): Promise<void> {
    
    // in .obj file, indexing starts from 1
    let vertex_offset = 1;
    let vertex_texture_offset = 1;

    let fileContents = ''

    const usedTextures: Texture[] = []
    
    modelParts.forEach( ( modelPart, modelPartIndex ) => {

        fileContents += `o Object ${modelPartIndex+1}\n`

        const { vertexes, faces } = modelPart

        vertexes.forEach( vertex => {

            // Calculate the actual position relative to the parent model part if it's required
            let modelPartWithOffset = modelPart

            while ( modelPartWithOffset ) {
                vertex.x += modelPartWithOffset.origin_rel_to_parent.x;
                vertex.y += modelPartWithOffset.origin_rel_to_parent.y;
                vertex.z += modelPartWithOffset.origin_rel_to_parent.z;
                modelPartWithOffset = modelParts[modelPartWithOffset.parent_index];
            }

            fileContents += `v ${vertex.x * SCALE} ${-vertex.y * SCALE} ${-vertex.z * SCALE}\n`
        } )
    
        faces.forEach( face => {

            let textureIndex = 0;
            let texture: Texture;

            // try to find the texture for this face among recently used
            for ( let i = 0 ; i < usedTextures.length ; i++ ) {
                if ( doesFaceBelongToTexture( face, usedTextures[i] ) ) {
                    texture = usedTextures[i];
                    textureIndex = i;
                    break;
                }
            }

            // failed to find the texture in cache? find it among all available textures
            if ( !texture ) {
                texture = textures.find( texture => doesFaceBelongToTexture( face, texture ) )

                // found the texture? put it in the cache
                if ( texture ) {
                    usedTextures.push( texture )
                    textureIndex = usedTextures.length - 1
                    fileContents += `mtllib tex${textureIndex}.mtl\n`
                }
            }

            if ( texture ) {
                fileContents += `usemtl tex${textureIndex}\n`
                face.vertexes.forEach( vertex => {
                    const x = ( vertex.uv_x - texture.x_on_page ) / texture.width;

                    // reflected by Y axis
                    const y = 1 - ( ( vertex.uv_y - texture.y_on_page ) / texture.height );

                    fileContents += `vt ${x} ${y}\n`
                } )
            }

            let faceString = 'f'
            face.vertexes.forEach( ( vertex, index ) => {
                if ( texture ) {
                    faceString += ` ${vertex.index + vertex_offset}/${vertex_texture_offset + index}`
                } else {
                    faceString += ` ${vertex.index + vertex_offset}`
                }
            } )
            fileContents += `${faceString}\n`
    
            if ( texture ) {
                vertex_texture_offset += face.vertexes.length
            }
        } )
    
        vertex_offset += modelPart.vertexes.length
    } )
    
    fs.writeFileSync( `${dirPath}/out.obj`, fileContents );

    let materialFileContents = ''
    for ( let index = 0 ; index < usedTextures.length ; index++ ) {
        const texture = usedTextures[index]
        const pngTexture = await makePNGTexture( V_MEM, texture )
        
        fs.writeFileSync( `${dirPath}/tex${index}.png`, pngTexture );

        materialFileContents += `newmtl tex${index}\n`
        materialFileContents += `map_Kd tex${index}.png`
        if ( index < usedTextures.length - 1 ) {
            materialFileContents += `\n\n`
        }
    }
    
    fs.writeFileSync( `${dirPath}/out.mtl`, materialFileContents );
    console.log( `Amount of textures utilised: ${usedTextures.length}` )
}