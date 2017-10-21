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