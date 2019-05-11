const fs = require( 'fs' ).promises

const Jimp = require( 'Jimp' )

function parseTIM( FILE = Buffer.alloc( 0 ) ) {
    const header = FILE.readInt32LE( 0x0 )
    if ( header !== 0x10 ) {
        throw new Error( 'Provided file is not of TIM format' )
    }

    const type_header = FILE.readInt32LE( 0x4 )
    const type =
        type_header === 0x8 ? '4bpp' :
        // type_header === 0x9 ? '8bpp' :
        // type_header === 0x2 ? '16bpp' :
        // type_header === 0x3 ? '24bpp' :
        ''

    if ( !type ) {
        throw new Error( `Provided file has unknown type header: ${type_header}` )
    }

    const clut_amount = type === '4bpp' ? FILE.readInt16LE( 0x12 ) : 0
    const clut_size =
        type === '4bpp' ? 32 :
        0
    const clut_total_size = clut_size * clut_amount

    const width =
        type === '4bpp' ? FILE.readInt16LE( 0x14 + clut_total_size + 0x8 ):
        0

    const width_actual =
        type === '4bpp' ? width * 4 :
        0

    const height = type === '4bpp' ?
        FILE.readInt16LE( 0x14 + clut_total_size + 0xA ) :
        0

    const cluts = [ ... new Array( clut_amount ) ]
        .map( ( _, index ) => {

            const offset = 0x14 + index * clut_size

            const colors = []
            const color_count = clut_size / 2
            for ( let i = 0 ; i < color_count ; i++ ) {
                const bytes = FILE.readInt16LE( offset + i * 0x2 )
                const raw_color = {
                    red: bytes & 0x1F,
                    green: ( bytes >> 5 ) & 0x1f,
                    blue: ( bytes >> 10 ) & 0x1f
                }
                const color = {
                    red: Math.round( ( raw_color.red / 31 ) * 255 ),
                    green: Math.round( ( raw_color.green / 31 ) * 255 ),
                    blue: Math.round( ( raw_color.blue / 31 ) * 255 )
                }

                const coded = Jimp.rgbaToInt( color.red, color.green, color.blue, 255 )
                colors.push( {
                    ...color,
                    coded
                } )
            }

            return colors
        } )

    const pixels = []
    for ( let row = 0 ; row < height ; row++ ) {
        const pixel_row = []

        for ( let col = 0 ; col < width ; col++ ) {

            if ( type === '4bpp' ) {
                const index = col + row * width

                const offset = 0x40 + index * 0x2
                const byte1 = FILE.readUInt8( offset )
                const byte2 = FILE.readUInt8( offset + 0x1 )

                const clut_indexes = [
                    byte1 & 0x0f,
                    byte1 >> 4,
                    byte2 & 0x0f,
                    byte2 >> 4
                ]

                const pixels = clut_indexes.map( ( clut_index, pixel_index ) => ( {
                    col: col * 0x4 + pixel_index,
                    row,
                    ...cluts[0][clut_index]
                } ) )

                pixel_row.push( ...pixels )
            } else {
                return undefined
            }
        }

        pixels.push( pixel_row )
    }

    return {
        clut_amount,
        cluts,

        width,
        width_actual,
        height,

        pixels
    }
}

module.exports.timToPngBuffer = async function( file_path ) {
    const TIM_FILE = await fs.readFile( file_path )

    const result = parseTIM( TIM_FILE )

    const image = new Jimp( result.width_actual, result.height )
    result.pixels.forEach( ( pixel_row, y ) => {
        pixel_row.forEach( ( pixel, x ) => {
            image.setPixelColor( pixel.coded, x, y);
        } )
    } )

    return image.getBufferAsync( Jimp.MIME_PNG )
}
