import jimp = require( 'jimp' )
import { Pixel } from './sstate'

export function PSXPointerToOffset( PSX_MEM: Buffer, slice: Buffer | number ) {
    if ( typeof slice === 'number' ) {
        slice = Buffer.from( slice.toString( 16 ) )
    }

    return Number( `0x${slice.swap32().toString( 'hex', 1, 4 )}` )
}

export function extractPSXPointer( PSX_MEM: Buffer, offset: number ) {
    return PSX_MEM.slice( offset, offset + 4 )
}

export function extractPSXPointerAndGetOffset( PSX_MEM: Buffer, offset: number ) {
    return PSXPointerToOffset( PSX_MEM, extractPSXPointer( PSX_MEM, offset ) )
}

export async function makeTexture( params: {
    V_MEM: Pixel[][],
    x: number,
    y: number,
    width: number,
    height: number,
    clut_x: number,
    clut_y: number
} ): Promise<Buffer> {
    const { V_MEM, x, y, width, height, clut_x, clut_y } = params

    // HACK: this definition is required - developer of jimp didn't make typings right
    const jimpConstructor: (w: number, h: number, cb?: Jimp.ImageCallback) => void = jimp as any

    const image = await new Promise<jimp>( resolve => {
        new jimpConstructor( width, height, ( err, image ) => {
            resolve( image )
        } );
    } )

    const palette: number[] = []
    for ( let i = 0 ; i < 16 ; i++ ) {
        const pixel = V_MEM[clut_x + i][clut_y]
        const color = {
            red: Math.floor( ( pixel.red / 31 ) * 255 ),
            green: Math.floor( ( pixel.green / 31 ) * 255 ),
            blue: Math.floor( ( pixel.blue / 31 ) * 255 )
        }
        palette.push( jimp.rgbaToInt( color.red, color.green, color.blue, 255 ) )
    }

    for ( let row = 0 ; row < height ; row++ ) {
        for ( let col = 0 ; col < ( width / 4 ) - 1 ; col ++ ) {
            const pixel = V_MEM[x + col][y + row];
            
            image.setPixelColor( palette[ pixel.clut1 ], ( col * 4 ) + 0, row );
            image.setPixelColor( palette[ pixel.clut2 ], ( col * 4 ) + 1, row );
            image.setPixelColor( palette[ pixel.clut3 ], ( col * 4 ) + 2, row );
            image.setPixelColor( palette[ pixel.clut4 ], ( col * 4 ) + 3, row );
        }
    }

    return await new Promise<Buffer>( ( resolve ) => {
        image.getBuffer( 'image/png', ( err, buffer ) => {
            resolve( buffer )
        } )
    } )
}