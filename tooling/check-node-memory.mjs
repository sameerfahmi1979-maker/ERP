import v8 from "node:v8";
const limitMb = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
console.log(`Node heap limit (MB): ${limitMb}`);
