import {$} from "bun"

for await (let line of $`echo "apa kabar"`.lines()){
    console.log(line)
}