const app = require("./src/app");
let { APP_PORT, REGION } = require("./src/config/config");
APP_PORT = APP_PORT || 3000;

app.listen(APP_PORT, () => console.log(`Example app listening on port ${APP_PORT}!`));
