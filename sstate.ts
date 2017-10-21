import fs = require( 'fs' )

interface Pixel {
    clut1: number,
    clut2: number,
    clut3: number,
    clut4: number
}

interface SaveState {
    PSX_MEM: Buffer,
    V_MEM: Pixel[][]
}

export function parseSaveState( filePath: string ): SaveState {
    const SAVE_STATE = fs.readFileSync( filePath )

    const VRAM_BUFFER = SAVE_STATE.slice( 0x2733DF, 0x2733DF + 0x100000 )
    const VRAM_WIDTH_IN_BYTES = 2048
    const VRAM_HEIGHT = VRAM_BUFFER.length / VRAM_WIDTH_IN_BYTES
    
    const V_MEM: Pixel[][] = []
    for ( let i = 0 ; i < VRAM_WIDTH_IN_BYTES ; i += 2 ) {
        const row: Pixel[] = []
        for ( let j = 0 ; j < VRAM_HEIGHT ; j++ ) {
            const offset = i + ( j * VRAM_WIDTH_IN_BYTES )
            const pixel = VRAM_BUFFER.slice( offset, offset + 2 )

            const byte1 = pixel.readUInt8( 0 )
            const byte2 = pixel.readUInt8( 1 )

            row.push( {
                clut1: byte1 & 0x0f,
                clut2: byte1 >> 4,
                clut3: byte2 & 0x0f,
                clut4: byte2 >> 4
            } )
        }
        V_MEM.push( row )
    }

    return {
        PSX_MEM: SAVE_STATE.slice( 0x1BA, 0x1BA + 0x200000 ),
        V_MEM
    }
}