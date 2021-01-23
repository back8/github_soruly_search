module.exports = async function (fastify, opts) {
  const fetch = require("node-fetch");
  fastify.post("/update", async function (request, reply) {
    const startTime = Date.now();
    reply.raw.writeHead(200, {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked",
    });
    reply.raw.write("Remove existing index...\n");
    const resultDelete = await fetch(`${process.env.ELASTICSEARCH_ENDPOINT}/files`, {
      method: "DELETE",
    }).then((response) => response.json());
    reply.raw.write(`${JSON.stringify(resultDelete)}\n`);

    reply.raw.write("Creating new index...\n");
    const result = await fetch(`${process.env.ELASTICSEARCH_ENDPOINT}/files`, {
      method: "PUT",
      body: JSON.stringify({
        settings: {
          index: {
            number_of_shards: 3,
            number_of_replicas: 0,
          },
        },
      }),
      headers: { "Content-Type": "application/json" },
    }).then((response) => response.json());
    reply.raw.write(`${JSON.stringify(result)}\n`);
    reply.raw.write("Reading filelist...\n");
    const fileList = request.body.split("\n");

    reply.raw.write("Indexing...\n");
    const asyncTask = async function* () {
      const bulkSize = 10000;
      let start = 0;
      let end = 0;
      while (start < fileList.length) {
        end = start + bulkSize;
        end = end > fileList.length ? fileList.length : end;
        const command = [];
        for (let i = start; i < end; i += 1) {
          command.push({ index: { _id: start + i + 1 } });
          command.push({ filename: fileList[start + i] });
        }
        const body = `${command.map((obj) => JSON.stringify(obj)).join("\n")}\n`;
        await fetch(`${process.env.ELASTICSEARCH_ENDPOINT}/files/file/_bulk`, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/x-ndjson" },
        }).then((respond) => respond.json());
        yield end;
        start = end;
      }
    };
    for await (const end of asyncTask()) {
      reply.raw.write(`${end}\n`);
    }
    reply.raw.write(
      `Index update took ${((Date.now() - startTime) / 1000).toFixed(2)} seconds for ${
        fileList.length
      } records\n`
    );
    reply.raw.end();
  });
};
