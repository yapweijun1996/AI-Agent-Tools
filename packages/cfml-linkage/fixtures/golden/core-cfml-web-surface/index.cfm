<!--- Inert structural fixture for the bounded CFML scanner. --->
<cfinclude template="shared/header.cfm">
<cfimport prefix="app" path="app">
<cfinvoke component="handlers.OrderHandler" method="submit">
<cfobject component="handlers.OrderHandler" name="handler">
<cfmodule name="custom/order.cfm">
<cfif form.usage eq "order">
  <cfset request.orderId = form.id>
</cfif>
