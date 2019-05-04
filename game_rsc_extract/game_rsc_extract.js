const fs = require( 'fs' )
const path = require( 'path' )

const GAME_RSC = fs.readFileSync( process.argv[2] || './GAME.RSC' )







function formatPointer( num = 0 ) {
    return '0x' + num.toString( 16 ).padStart( 8, 0 )
}

function parseDOSName( offset ) {
    return GAME_RSC.slice( offset, offset + 12 ).toString( 'utf8' ).replace( /\u0000/g, '' )
}

function parseFileEntry( offset ) {
    return {
        // offset: formatPointer( offset ),
        name: parseDOSName( offset ),
        // something: buf.readInt32LE( offset + 0xC ),
        file_offset_table_index: GAME_RSC.readInt16LE( offset + 0x10 ),
        // weird_offset: buf.readInt16LE( offset + 0x12 )
    }
}

function parseDirectory( offset ) {
    const directory_ptr = GAME_RSC.readInt32LE( offset )
    const file_count = GAME_RSC.readInt32LE( offset + 0x4 )

    const files = [ ... new Array( file_count ) ]
        .map( ( _, index ) => parseFileEntry( directory_ptr + index * 0x14 ) )

    return {
        directory_ptr: formatPointer( directory_ptr ),
        file_count,

        files
    }
}

function parseFileOffsets( offset ) {
    const file_count = GAME_RSC.readInt32LE( offset )

    return {
        file_count,

        files: [ ... new Array( file_count ) ]
            .map( ( _, index ) => ( {
                index,
                offset: GAME_RSC.readInt32LE( ( offset + 0x8 * index ) + 0x4 ),
                something: GAME_RSC.readInt32LE( ( offset + 0x8 * index ) + 0x8 )
            } ) )
    }
}

function extractOffsets() {
    const file_offsets_ptr = GAME_RSC.readInt32LE( 0 )

    const directory_count = 16

    const directories = [ ...new Array( directory_count ) ]
        .map( ( _, index ) => parseDirectory( 0x4 + index * 0x8 ) )

    const file_offsets = parseFileOffsets( file_offsets_ptr ).files

    return {
        file_offsets_ptr: formatPointer( file_offsets_ptr ),

        directories: directories
            .map( ( directory, index ) => ( {
                name: (
                    index === 0 ? 'levels' :
                    index === 2 ? 'levels-loading-screens_and_item-descriptions' :
                    index === 4 ? 'models_maybe' :
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
            .filter( directory => directory.files.length > 0 )
            .map( directory => ( {
                ...directory,
                files: directory.files.map( file => {
                    const file_offset = file_offsets[file.file_offset_table_index].offset
                    const next_file = file_offsets[file.file_offset_table_index + 1]

                    return {
                        ...file,
                        file_offset,
                        file_offset_formatted: formatPointer( file_offset ),
                        file_size: next_file ? ( next_file.offset - file_offset ) : 0
                    }
                } )
            } ) )
    }
}

const results = extractOffsets()

const root_dir = path.join( './', 'output' )

results.directories.forEach( directory => {
    const directory_dir = path.join( root_dir, directory.name )
    fs.mkdirSync( directory_dir, { recursive: true } )

    directory.files.forEach( file => {
        const file_path = path.join( directory_dir, file.name )
        const data = GAME_RSC.slice( file.file_offset, file.file_offset + file.file_size )
        fs.writeFile( file_path, data, ( err ) => {
            if ( err ) {
                throw err
            }
        } )
    } )
} )

fs.writeFileSync( './entries.json', JSON.stringify( results, undefined, 2 ) )