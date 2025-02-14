import findPort from '@/lib/find-port'
import { describe, expect, test } from 'bun:test'


describe('get-port', () => {
    test('findPort', async () => {
        const port = await findPort({ count: 10 })
        console.log(port)
        expect(port).toBeArray()
    })
})