import fs from 'fs/promises';

; (async () => {

    // const decoder = new TextDecoder();
    // const proc = Bun.spawn(["/bin/bash", "apa.sh"]);
    // const text = new Response(proc.stdout);

    // for await (const chunk of text.body || []) {
    //     fs.appendFile('x.log', decoder.decode(chunk));
    // }


    console.log(process.env.NAMA)

})();
