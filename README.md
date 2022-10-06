
TODO v0.0.1

- doc: how to install, run
- doc: tests scope and purpose (load, regression)
- doc: proxy (why, how to, how does it works)
- linter and stuff

---

NOTES

HOW TO USE PROXY

// 1 found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"}]}' \
http://localhost:3002/

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"d","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"}]}' \
http://localhost:3002/

// 1 not found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsXXXX"}]}' \
http://localhost:3002/

// 1 found, 1 not found

curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbX"}]}' \
http://localhost:3002/

autocannon -m POST \
-H "Content-Type":"application/json" \
-b '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"},{"type":"d","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"d","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"}]}' \
http://localhost:3002/

curl "http://localhost:3001/inspect/start"; \
 ONLY=single-block-info.json npm run test:regression; \
 curl "http://localhost:3001/inspect/stop"

---

# Aknowledgements

The "setup" stage before runnig the tests is missing, we assume these data are already presente in the target system.
