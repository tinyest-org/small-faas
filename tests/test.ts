
const body = new FormData();

body.append("params", JSON.stringify(["-10"]));


const req = await fetch(
    "http://localhost:8000/increment", {
    method: 'POST',
    body,
});

console.log(await req.json());