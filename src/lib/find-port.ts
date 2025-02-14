

import getPort, { portNumbers } from 'get-port';

async function findPort(params?: { count?: number, portStart?: number, portEnd?: number, exclude?: number[] }) {
    const { count = 1, portStart = 3000, portEnd = 6000, exclude = [] } = params || {}

    const listPort = [...exclude].flat()
    const usedPorts = Array.from(new Set(listPort)) as number[]

    // Validasi input
    if (count <= 0) {
        throw new Error('Count harus lebih besar dari 0');
    }
    if (count > (portEnd - portStart + 1)) {
        throw new Error(`Count tidak boleh lebih besar dari range port (${portEnd - portStart + 1})`);
    }

    // Tambahan validasi
    if (portStart >= portEnd) {
        throw new Error('portStart harus lebih kecil dari portEnd');
    }
    if (portStart < 0 || portEnd > 65535) {
        throw new Error('Port harus berada dalam rentang 0-65535');
    }

    // Optimasi pencarian port
    const availablePorts = new Set<number>();
    const portRange = portNumbers(portStart, portEnd);
    const usedPortsSet = new Set(usedPorts);

    for (const port of portRange) {
        if (availablePorts.size >= count) break;

        // Skip jika port sudah digunakan
        if (usedPortsSet.has(port)) continue;

        try {
            const availablePort = await getPort({
                port,
                exclude: [...usedPorts, ...Array.from(availablePorts)]
            });
            if (availablePort === port) {
                availablePorts.add(port);
            }
        } catch (error) {
            console.warn(`Gagal memeriksa port ${port}:`, error);
            continue; // Lanjutkan ke port berikutnya alih-alih throw error
        }
    }

    return availablePorts.size === count ? Array.from(availablePorts) : null;
}

export default findPort;    