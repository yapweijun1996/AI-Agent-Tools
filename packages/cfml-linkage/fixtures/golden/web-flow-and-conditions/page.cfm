<!--- Inert conditional web-flow fixture. --->
<cfif url.mode eq "save">
  <form action="/orders/save" method="post"></form>
  <script>
    fetch("/api/orders");
    $.ajax({ url: "/orders/search", type: "POST" });
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/orders/xhr");
  </script>
</cfif>
<cflocation url="/orders/done">
