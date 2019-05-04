import * as jimp from 'jimp'
import { Pixel } from './sstate'
import { Face } from './parse'

export interface Texture {
    offset: string, // hex
    x: number,
    y: number,

    texture_page_index: number,
    texture_page_col: number,
    texture_page_row: number,
    x_on_page: number,
    y_on_page: number,
    
    clut_x: number,
    clut_y: number,
    
    weird_flag: number,
    width: number,
    height: number
}

export async function makePNGTexture( V_MEM: Pixel[][], texture: Texture ): Promise<Buffer> {
    const { x, y, clut_x, clut_y, width, height } = texture

    // HACK: this definition is required - developer of jimp didn't make typings right
    const jimpConstructor: ( w: number, h: number, cb?: Jimp.ImageCallback ) => void = jimp as any

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
        for ( let col = 0 ; col < Math.ceil( width / 4 ) ; col ++ ) {
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

// It's unknown if this method only applicable to Colony Wars Red Sun, but 
// it relies on searching for VMEM headers in memory.
// All textures are 4 bit
export function getAllTextures( PSX_MEM: Buffer, V_MEM: Pixel[][] ): Texture[] {
    const textures: Texture[] = []

    for ( let i = 0 ; i < PSX_MEM.byteLength ; i++ ) {
        
        const VMEM_STRING = PSX_MEM.slice( i, i + 4 ).toString( 'utf8' );
    
        if (
            VMEM_STRING === 'VMEM' &&
            PSX_MEM.readUInt32LE( i + 0x4 ) === 16
        ) {
            const VMEM_STRING_2 = PSX_MEM.slice( i + 0x18, i + 0x18 + 4 ).toString( 'utf8' );
            if ( VMEM_STRING_2 !== 'VMEM' ) {
                continue;
            }

            const x = PSX_MEM.readUInt16LE( i + 0x8 )
            const y = PSX_MEM.readUInt16LE( i + 0xA )
            const texture_page_col = Math.ceil( ( x + 1 ) / 64 ) - 1;
            const texture_page_row = y >= 256 ? 1 : 0
            const texture_page_index = texture_page_col + texture_page_row * 16

            const texture: Texture = {
                offset: i.toString( 16 ),
                x,
                y,

                texture_page_index,
                texture_page_col,
                texture_page_row,
                x_on_page: ( x - texture_page_col * 64 ) * 4,
                y_on_page: ( y - texture_page_row * 256 ),
                
                clut_x: PSX_MEM.readUInt16LE( i + 0xC ),
                clut_y: PSX_MEM.readUInt16LE( i + 0xE ),
                
                weird_flag: PSX_MEM.readUInt16LE( i + 0x10 ),
                width: PSX_MEM.readUInt16LE( i + 0x12 ),
                height: PSX_MEM.readUInt16LE( i + 0x16 ),
            }

            // It might not be an actual sprite or texture if it's got garbage CLUT
            if ( texture.clut_x > 1008 || texture.clut_y > 512 ) {
                continue;
            }

            if ( [ 6, 8, 12, 14, 16, 24, 26, 32, 38, 42 ].includes( texture.weird_flag ) ) {
                // Rotate the texture
                const temp = texture.width;
                texture.width = texture.height;
                texture.height = temp;
            } else if ( texture.weird_flag === 4 ) {
                // Origin of texture is not an upper left corner when looking at VRAM,
                // so it has to be changed by applying an offset
                texture.x -= texture.width
            }

            textures.push( texture )
        }
    }

    return textures;
}

export function doesFaceBelongToTexture( face: Face, texture: Texture ): boolean {
    const { uv_x, uv_y } = face.vertexes[0]

    return (
        face.texture_page_index === texture.texture_page_index &&
        uv_x >= texture.x_on_page && uv_x < texture.x_on_page + texture.width &&
        uv_y >= texture.y_on_page && uv_y < texture.y_on_page + texture.height
    );
}