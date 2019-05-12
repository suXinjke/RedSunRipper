const fs = require( 'fs' ).promises

const Jimp = require( 'Jimp' )

module.exports.parseTIM = function( FILE = Buffer.alloc( 0 ) ) {
    const header = FILE.readInt32LE( 0x0 )
    if ( header !== 0x10 ) {
        throw new Error( 'Provided file is not of TIM format' )
    }

    const type_header = FILE.readInt32LE( 0x4 )
    const type =
        type_header === 0x8 ? '4bpp' :
        type_header === 0x9 ? '8bpp' :
        // type_header === 0x2 ? '16bpp' :
        // type_header === 0x3 ? '24bpp' :
        ''

    if ( !type ) {
        throw new Error( `Provided file has unknown type header: ${type_header}` )
    }

    const clut_size = FILE.readUInt32LE( 0x8 )
    const clut_amount = FILE.readUInt16LE( 0x12 )
    const clut_entries = ( clut_size - 0xC ) / 2
    const pixel_entries =
        type === '4bpp' ? 4 :
        type === '8bpp' ? 2 :
        0

    const width = FILE.readUInt16LE( 0x8 + clut_size + 0x8 )
    const width_actual =
        type === '4bpp' ? width * 4 :
        type === '8bpp' ? width * 2 :
        0

    const height = FILE.readUInt16LE( 0x8 + clut_size + 0xA )

    const cluts = [ ... new Array( clut_amount ) ]
        .map( ( _, index ) => {

            const offset = 0x14 + index * 0x2

            const colors = []
            for ( let i = 0 ; i < clut_entries ; i++ ) {
                const bytes = FILE.readInt16LE( offset + i * 0x2 )
                const raw_color = {
                    red: bytes & 0x1F,
                    green: ( bytes >> 5 ) & 0x1f,
                    blue: ( bytes >> 10 ) & 0x1f
                }
                const color = {
                    red: raw_color.red * 8,
                    green: raw_color.green * 8,
                    blue: raw_color.blue * 8
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

            const index = col + row * width

            const offset = 0x8 + clut_size + 0xC + index * 0x2
            const byte1 = FILE.readUInt8( offset )
            const byte2 = FILE.readUInt8( offset + 0x1 )

            const clut_indexes =
                type === '4bpp' ? [
                    byte1 & 0x0f,
                    byte1 >> 4,
                    byte2 & 0x0f,
                    byte2 >> 4
                ] :
                type === '8bpp' ? [
                    byte1,
                    byte2
                ] : []

            const pixels = clut_indexes.map( ( clut_index, pixel_index ) => ( {
                col: col * pixel_entries + pixel_index,
                row,
                ...cluts[0][clut_index]
            } ) )

            pixel_row.push( ...pixels )
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

module.exports.parsedTimToPngBuffer = function( TIM ) {

    const image = new Jimp( TIM.width_actual, TIM.height )
    TIM.pixels.forEach( ( pixel_row, y ) => {
        pixel_row.forEach( ( pixel, x ) => {
            image.setPixelColor( pixel.coded, x, y )
        } )
    } )

    return image.getBufferAsync( Jimp.MIME_PNG )
}
