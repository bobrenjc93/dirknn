import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    route("*", "routes/home.tsx"), // meh just do development at /viewer instead of index
] satisfies RouteConfig;
