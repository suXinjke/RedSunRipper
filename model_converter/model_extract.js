const fs = require( 'fs' ).promises
const path = require( 'path' )
const timToPngBuffer = require( './tim' ).timToPngBuffer

function formatPointer( num = 0 ) {
    return '0x' + num.toString( 16 ).padStart( 8, '0' )
}

// 4096 = 1.0f
function normalizeRotationMatrix(
    rotationMatrix = [ [ 4096, 0, 0 ], [ 0, 4096, 0 ], [ 0, 0, 4096 ] ]
) {
    const result = [
        [ ...rotationMatrix[0] ],
        [ ...rotationMatrix[1] ],
        [ ...rotationMatrix[2] ]
    ]

    for ( const row of result ) {
        for ( let i = 0 ; i < row.length ; i++ ) {
            row[i] = ( row[i] / 4096 )
        }
    }

    return result
}

function rotate(
    coords = { x: 0, y: 0, z: 0 },
    rotationMatrix = [ [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] ]
) {

    const { x, y, z } = coords
    return {
        x: x * rotationMatrix[0][0] + y * rotationMatrix[0][1] + z * rotationMatrix[0][2],
        y: x * rotationMatrix[1][0] + y * rotationMatrix[1][1] + z * rotationMatrix[1][2],
        z: x * rotationMatrix[2][0] + y * rotationMatrix[2][1] + z * rotationMatrix[2][2]
    }
}

function parseVertex( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    return {
        x: FILE.readInt16LE( offset + 0x0 ),
        y: FILE.readInt16LE( offset + 0x2 ),
        z: FILE.readInt16LE( offset + 0x4 )
    }
}

const faceTypes = {
    0x0920: { size: 0x12 },
    0x0962: { size: 0x12 },
    0x0961: { size: 0x12 },
    0x0A30: { size: 0x14 },
    0x0A71: { size: 0x14 },
    0x0AB0: { size: 0x14 },
    0x0B24: { size: 0x16, quad: true },
    0x0B65: { size: 0x16, quad: true },
    0x0B66: { size: 0x16, quad: true },
    0x0C34: { size: 0x18, quad: true },
    0x0C38: { size: 0x18 },
    0x0C75: { size: 0x18 },
    0x0C79: { size: 0x18 },
    0x0CB4: { size: 0x18, quad: true },
    0x0CB8: { size: 0x18 },
    0x0F3C: { size: 0x1E, quad: true },
    0x0F7D: { size: 0x1E, quad: true },
    0x0FBC: { size: 0x1E, quad: true },
    0x4B24: { size: 0x16, quad: true },
    0x4B65: { size: 0x16, quad: true },
    0x4920: { size: 0x12 },
    0x4961: { size: 0x12 },
    0x4C34: { size: 0x18, quad: true },
    0x4C38: { size: 0x18 },
    0x4C79: { size: 0x18, quad: true },
    0x4F3C: { size: 0x1E, quad: true },
    0x4F7D: { size: 0x1E, quad: true },
    0x8A30: { size: 0x14, },
    0x8920: { size: 0x12, },
    0x8B24: { size: 0x16, quad: true },
    0x8C34: { size: 0x18, quad: true },
    0x8C38: { size: 0x18 },
    0x8F3C: { size: 0x1E, quad: true },
    0xCB65: { size: 0x16, quad: true },
}

function parseFace( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    const type = FILE.readUInt16LE( offset )
    const faceType = faceTypes[type]
    if ( !faceType ) {
        throw new Error( `Unknown facetype: ${formatPointer( type )}\noffset: ${formatPointer( offset )}` )
    }
    const { size, quad } = faceType

    return {
        type: formatPointer( type ),
        offset: formatPointer( offset ),

        vertexes: quad ? [
            FILE.readInt16LE( offset + 0x2 ),
            FILE.readInt16LE( offset + 0x4 ),
            FILE.readInt16LE( offset + 0x6 ),
            FILE.readInt16LE( offset + 0x8 ),
        ] : [
            FILE.readInt16LE( offset + 0x2 ),
            FILE.readInt16LE( offset + 0x4 ),
            FILE.readInt16LE( offset + 0x6 ),
        ],

        size
    }
}

function parseObjectMeta( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    const rotation_matrix = [
        [
            FILE.readInt16LE( offset + 0x0C ),
            FILE.readInt16LE( offset + 0x0E ),
            FILE.readInt16LE( offset + 0x10 )
        ],
        [
            FILE.readInt16LE( offset + 0x12 ),
            FILE.readInt16LE( offset + 0x14 ),
            FILE.readInt16LE( offset + 0x16 )
        ],
        [
            FILE.readInt16LE( offset + 0x18 ),
            FILE.readInt16LE( offset + 0x1A ),
            FILE.readInt16LE( offset + 0x1C )
        ],
    ]

    return {
        offset: formatPointer( offset ),
        parent_index: FILE.readInt32LE( offset + 0x0 ),

        rotation_matrix,
        rotation_matrix_normalized: normalizeRotationMatrix( rotation_matrix ),

        x_offset: FILE.readInt32LE( offset + 0x20 ),
        y_offset: FILE.readInt32LE( offset + 0x24 ),
        z_offset: FILE.readInt32LE( offset + 0x28 ),
    }
}



function parseMesh( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    const size = FILE.readInt32LE( offset )

    const vertex_amount = FILE.readInt32LE( offset + 0xC )
    const vertex_rel_pointer = FILE.readInt32LE( offset + 0x10 )
    const vertex_abs_pointer = offset + vertex_rel_pointer

    const face_amount = FILE.readInt32LE( offset + 0x1C )
    const face_rel_pointer = FILE.readInt32LE( offset + 0x24 )
    const face_abs_pointer = offset + face_rel_pointer

    const faces = []
    let face_offset = face_abs_pointer
    for ( let i = 0 ; i < face_amount ; i++ ) {
        const face = parseFace( FILE, face_offset )

        faces.push( face )
        face_offset += face.size
    }

    return {
        offset: formatPointer( offset ),
        size,

        scale_factor: FILE.readInt8( offset + 0x8 ),

        vertex_amount,
        vertex_offset: {
            rel: formatPointer( vertex_rel_pointer ),
            abs: formatPointer( vertex_abs_pointer )
        },

        normals_amount_maybe: FILE.readInt32LE( offset + 0x14 ),
        normals_offset_maybe: {
            rel: formatPointer( FILE.readInt32LE( offset + 0x18 ) ),
            abs: formatPointer( offset + FILE.readInt32LE( offset + 0x18 ) )
        },

        faces_amount: face_amount,
        faces_offset: {
            rel: formatPointer( face_rel_pointer ),
            abs: formatPointer( face_abs_pointer )
        },

        vertexes: [ ...new Array( vertex_amount ) ]
            .map( ( _, index ) => parseVertex( FILE, vertex_abs_pointer + index * 0x8 ) ),

        faces: faces
    }
}

function parseObject( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    const object_size = FILE.readInt32LE( offset )
    const object_index = FILE.readInt32LE( offset + 0x4 )
    const mesh_amount = FILE.readInt32LE( offset + 0x8 )

    const first_mesh_rel_pointer = FILE.readInt32LE( offset + 0x10 )
    const first_mesh_abs_pointer = offset + first_mesh_rel_pointer

    const meshes = []
    let mesh_offset = first_mesh_abs_pointer
    for ( let i = 0 ; i < mesh_amount ; i++ ) {
        const mesh = parseMesh( FILE, mesh_offset )

        meshes.push( {
            mesh_index: i,
            ...mesh
        } )
        mesh_offset += mesh.size
    }

    return {
        object_index,
        object_offset: formatPointer( offset ),
        object_size,

        mesh_amount,
        first_mesh_pointer: {
            rel: formatPointer( first_mesh_rel_pointer ),
            abs: formatPointer( first_mesh_abs_pointer )
        },

        meshes
    }
}

function parseModel( FILE = Buffer.alloc( 0 ) ) {
    const object_meta_amount = FILE.readInt32LE( 0x34 )

    const texture_amount = FILE.readInt32LE( 0x4C )
    const textures_ptr = FILE.readInt32LE( 0x50 )

    const object_amount = FILE.readInt32LE( 0x54 )
    const objects = []
    let object_offset = FILE.readInt32LE( 0x58 )
    for ( let i = 0 ; i < object_amount ; i++ ) {
        const object = parseObject( FILE, object_offset )

        objects.push( object )
        objects.sort( ( a, b ) => a.object_index < b.object_index ? -1 : 1 )
        object_offset += object.object_size
    }

    return {
        object_meta_amount,
        object_meta: [ ...new Array( object_meta_amount ) ]
            .map( ( _, index ) => {
                return {
                    object_meta_index: index,
                    ...parseObjectMeta( FILE, 0x5C + index * 0x2C )
                }
            } ),

        textures_ptr: formatPointer( textures_ptr ),
        texture_amount,
        texture_ids: [ ...new Array( texture_amount ) ]
            .map( ( _, index ) => {
                return FILE.readInt16LE( textures_ptr + index * 0xC )
            } ),

        object_amount,

        objects
    }
}

const helpMessage =
`Colony Wars Red Sun Model Converter
Converts original mesh files into OBJ models

node red_sun_make_obj.js [OPTIONS] <mesh_files_directory> <textures_directory> <output_directory>

List of options:
    --model-info        Additonal JSON info on original
                          model will be placed alongside
    --no-transform      Do not apply scaling, rotation
                          and translation to model parts
    --no-inverse-axis   Do not invert Y axis
    --no-subdirectories Do not separate output by directories
    --no-textures       Do not output texture data
`

async function main() {
    if ( process.argv.length < 5 ) {
        console.log( helpMessage )
        return
    }

    const [ input_mesh_directory, input_texture_directory, output_directory ] = process.argv.slice( -3 )

    await fs.mkdir( output_directory, { recursive: true } )

    const model_file_names = await fs.readdir( input_mesh_directory )
    if ( model_file_names.length === 0 ) {
        throw new Error( 'No model files found in <mesh files directory' )
    }

    const models = await Promise.all( model_file_names.map( model_file_name => {
        const model_file_path = path.join( input_mesh_directory, model_file_name )
        return fs.readFile( model_file_path )
            .then( data => {
                const parsed_data = parseModel( data )
                console.log( `Parsed ${model_file_name}` )
                return {
                    file_name: model_file_name,
                    data: parsed_data
                }
            } )
    } ) )

    const output_model_info = process.argv.includes( '--model-info' )
    const no_transform = process.argv.includes( '--no-transform' )
    const no_inverse_axis = process.argv.includes( '--no-inverse-axis' )
    const no_subdirectories = process.argv.includes( '--no-subdirectories' )
    const no_textures = process.argv.includes( '--no-textures' )

    Promise.all( models.map( async model => {

        let OBJ_FILE_CONTENTS = ''
        const { objects, object_meta } = model.data

        let vertex_offset = 0
        for ( const obj of objects ) {
            const { object_index } = obj

            OBJ_FILE_CONTENTS += `o Object_${object_index}\n`

            for ( const mesh of obj.meshes ) {

                for ( const vertex of mesh.vertexes ) {

                    let { x, y, z } = vertex

                    if ( no_transform === false ) {

                        for ( let i = 0 ; i < mesh.scale_factor ; i++ ) {
                            x *= 2
                            y *= 2
                            z *= 2
                        }

                        let meta = object_meta[object_index]
                        while ( meta.parent_index !== -1 ) {

                            const rotated_vertex = rotate( { x, y, z }, meta.rotation_matrix_normalized )
                            x = rotated_vertex.x
                            y = rotated_vertex.y
                            z = rotated_vertex.z

                            x += meta.x_offset
                            y += meta.y_offset
                            z += meta.z_offset

                            meta = object_meta[meta.parent_index]
                        }
                    }

                    if ( no_inverse_axis === false ) {
                        y *= -1;
                    }

                    OBJ_FILE_CONTENTS += `v ${x} ${y} ${z}\n`
                }

                for ( const face of mesh.faces ) {
                    OBJ_FILE_CONTENTS += `f ${face.vertexes.map( v => v + 1 + vertex_offset ).join( ' ' )}\n`
                }

                vertex_offset += mesh.vertexes.length
            }
        }

        let model_output_directory = output_directory
        if ( no_subdirectories === false ) {
            model_output_directory = path.join( model_output_directory, model.file_name )
            await fs.mkdir( model_output_directory, { recursive: true } )
        }

        const model_file_path = path.join( model_output_directory, `${model.file_name}.obj` )
        const writeTasks = [ fs
            .writeFile( model_file_path, OBJ_FILE_CONTENTS )
            .then( _ => console.log( `Written ${model_file_path}` ) )
        ]
        if ( output_model_info ) {
            const model_info_file_path = path.join( model_output_directory, `${model.file_name}.json` )
            const model_info = JSON.stringify( model.data, undefined, 2 )
            writeTasks.push( fs
                .writeFile( model_info_file_path, model_info )
                .then( _ => console.log( `Written ${model_info_file_path}` ) )
            )
        }

        if ( no_textures === false ) {
            model.data.texture_ids.forEach( ( texture_id, index ) => {
                const input_texture_file_path = path.join( input_texture_directory, `TEX_${texture_id}.TIM` )
                const output_texture_file_path = path.join( model_output_directory, `tex_${index}.png` )
                writeTasks.push( timToPngBuffer( input_texture_file_path )
                    .then( png => fs.writeFile( output_texture_file_path, png ) )
                    .then( _ => console.log( `Written ${output_texture_file_path}` ) )
                )
            } )
        }

        await Promise.all( writeTasks )
    } ) )
}

(async () => {
    try {
        await main();
    } catch ( e ) {
        console.log( e.stack )
    }
})()