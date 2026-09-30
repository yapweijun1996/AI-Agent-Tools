// Inert client-flow fixture.
fetch("/api/orders");
$.ajax({ url: "/orders/search", type: "POST" });
const dynamicUrl = routeFromState();
fetch(dynamicUrl);
// fetch("/ignored-comment");
