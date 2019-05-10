const fs = require( 'fs' ).promises
const path = require( 'path' )

function formatPointer( num = 0 ) {
    return '0x' + num.toString( 16 ).padStart( 8, '0' )
}

function parseDOSName( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    return FILE.slice( offset, offset + 12 ).toString( 'utf8' ).replace( /\u0000/g, '' )
}

function parseFileEntry( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    return {
        offset: formatPointer( offset ),
        name: parseDOSName( FILE, offset ),
        file_offset_table_index: FILE.readInt16LE( offset + 0x10 )
    }
}

function parseDirectory( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    const directory_ptr = FILE.readInt32LE( offset )
    const file_amount = FILE.readInt32LE( offset + 0x4 )

    const files = [ ... new Array( file_amount ) ]
        .map( ( _, index ) => parseFileEntry( FILE, directory_ptr + index * 0x14 ) )

    return {
        directory_ptr: formatPointer( directory_ptr ),
        file_amount,

        files
    }
}

function parseFileOffsets( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    const file_amount = FILE.readInt32LE( offset )

    return [ ... new Array( file_amount ) ]
        .map( ( _, index ) => ( {
            index,
            offset: FILE.readInt32LE( ( offset + 0x8 * index ) + 0x4 ),
            is_texture: FILE.readInt32LE( ( offset + 0x8 * index ) + 0x8 ) === 5
        } ) )
        .map( ( file, index, array ) => {
            const next_file = array[index + 1]

            return {
                ...file,
                size: next_file ? ( next_file.offset - file.offset ) : 0
            }
        } )
}

function parseResources( FILE = Buffer.alloc( 0 ) ) {
    const file_offsets_ptr = FILE.readInt32LE( 0 )

    const directory_amount = 16

    const directories = [ ...new Array( directory_amount ) ]
        .map( ( _, index ) => parseDirectory( FILE, 0x4 + index * 0x8 ) )

    const file_offsets = parseFileOffsets( FILE, file_offsets_ptr )

    return {
        file_offsets_ptr: formatPointer( file_offsets_ptr ),
        file_offsets,

        directories: directories
            .map( ( directory, index ) => ( {
                name: (
                    index === 0 ? 'levels' :
                    index === 2 ? 'levels-loading-screens_and_item-descriptions' :
                    index === 4 ? 'models' :
                    index === 5 ? 'dummy_files' :
                    index === 6 ? 'levels_scripts' :
                    index === 8 ? 'menu_related_maybe' :
                    index === 9 ? 'levels_ground_related_maybe' :
                    index === 10 ? 'levels_tga_files' :
                    index === 11 ? 'levels_environment_data' :
                    index === 12 ? 'strings' :
                    index === 13 ? 'levels_ingame_messages' :
                    index === 14 ? 'levels_briefings_debriefings' :
                    index === 15 ? 'animations_maybe' :
                    `directory_${index}`
                ),
                files: directory.files
            } ) )
            .filter( directory => directory.files.length > 0 && directory.name !== 'dummy_files' )
            .map( directory => ( {
                ...directory,
                files: directory.files.map( file => {
                    const file_offset = file_offsets[file.file_offset_table_index]
                    const next_file = file_offsets[file.file_offset_table_index + 1]

                    return {
                        ...file,
                        is_texture: file_offset.is_texture,
                        file_offset: file_offset.offset,
                        file_offset_formatted: formatPointer( file_offset.offset ),
                        file_size: next_file ? ( next_file.offset - file_offset.offset ) : 0
                    }
                } )
            } ) )
    }
}

const helpMessage =
`Colony Wars Red Sun GAME.RSC extractor
Extracts GAME.RSC contents

node FILE_extract.js <GAME.RSC path> <output_directory>
`

async function main() {
    if ( process.argv.length < 4 ) {
        console.log( helpMessage )
        return
    }

    const [ GAME_RSC_PATH, output_directory ] = process.argv.slice( -2 )

    await fs.mkdir( output_directory, { recursive: true } )

    const GAME_RSC = await fs.readFile( GAME_RSC_PATH )

    const resources = parseResources( GAME_RSC )

    const directory_write_tasks = resources.directories.map( directory => {
        const directory_path = path.join( output_directory, directory.name )
        return fs.mkdir( directory_path, { recursive: true } )
            .then( _ => Promise.all( directory.files.map( file => {
                const file_path = path.join( directory_path, file.name )
                const data = GAME_RSC.slice( file.file_offset, file.file_offset + file.file_size )
                return fs.writeFile( file_path, data )
            } ) ) )
            .then( _ => console.log( `Extracted ${directory.name}` ) )
    } )

    const textures_dir = path.join( output_directory, 'textures' )
    const texture_write_tasks = fs
        .mkdir( textures_dir, { recursive: true } )
        .then( _ => {
            return resources.file_offsets
                .filter( file_offset => file_offset.is_texture && file_offset.size > 0 )
                .map( file_offset => {
                    const file_path = path.join( textures_dir, `TEX_${file_offset.index}.TIM` )
                    const data = GAME_RSC.slice( file_offset.offset, file_offset.offset + file_offset.size )
                    return fs.writeFile( file_path, data )
                } )
        } )

    Promise.all( [
        directory_write_tasks,
        texture_write_tasks
    ] )
}

(async () => {
    try {
        await main();
    } catch ( e ) {
        console.log( e.stack )
    }
})()