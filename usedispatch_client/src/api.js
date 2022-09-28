"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.addNewPostbox = exports.getNewChildId = exports.getMaxChildId = void 0;
var SUPABASE_URL = "https://aiqrzujttjxgjhumjcky.functions.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcXJ6dWp0dGp4Z2podW1qY2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjE0NzA5NjgsImV4cCI6MTk3NzA0Njk2OH0.qyDrAwwq1pyys4t12Klp7YWHCV05YRMj29Du2xRLKe8";
var axios = require('axios')["default"];
axios.defaults.headers.common["Authorization"] = "Bearer ".concat(SUPABASE_ANON_KEY);
axios.defaults.headers.common["Content-Type"] = "application/json";
axios.defaults.baseURL = SUPABASE_URL;
var getMaxChildId = function (cluster, forum_id) { return __awaiter(void 0, void 0, void 0, function () {
    var requestBody, request;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                requestBody = {
                    "cluster": cluster,
                    "forum_id": forum_id
                };
                if (cluster === "mainnet-beta") {
                    requestBody["cluster"] = "mainnet";
                }
                return [4 /*yield*/, axios.post("/getMaxChildId", requestBody)["catch"](function (error) { console.log(error); })];
            case 1:
                request = _a.sent();
                return [2 /*return*/, request.data.max_child_id];
        }
    });
}); };
exports.getMaxChildId = getMaxChildId;
var getNewChildId = function (cluster, forum_id) { return __awaiter(void 0, void 0, void 0, function () {
    var requestBody, request;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                requestBody = {
                    "cluster": cluster,
                    "forum_id": forum_id
                };
                if (cluster === "mainnet-beta") {
                    requestBody["cluster"] = "mainnet";
                }
                return [4 /*yield*/, axios.post("/getNewChildId", requestBody)["catch"](function (error) { console.log(error); })];
            case 1:
                request = _a.sent();
                return [2 /*return*/, request.data.new_child_id];
        }
    });
}); };
exports.getNewChildId = getNewChildId;
var addNewPostbox = function (cluster, forum_id) { return __awaiter(void 0, void 0, void 0, function () {
    var requestBody, request;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                requestBody = {
                    "cluster": cluster,
                    "forum_id": forum_id
                };
                if (cluster === "mainnet-beta") {
                    requestBody["cluster"] = "mainnet";
                }
                return [4 /*yield*/, axios.post("/addNewPostbox", requestBody)["catch"](function (error) { console.log(error); })];
            case 1:
                request = _a.sent();
                console.log(request);
                console.log(request.data);
                return [2 /*return*/, request.data];
        }
    });
}); };
exports.addNewPostbox = addNewPostbox;
function main() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, exports.addNewPostbox)('mainnet-beta', 'CjL2XpMtk6AbJXdDZDrkCWoDyiLmACoMNkEZU4jMWXay')];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
main();
