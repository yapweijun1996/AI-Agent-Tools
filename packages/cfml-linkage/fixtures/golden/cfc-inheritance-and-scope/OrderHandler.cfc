<cfcomponent name="handlers.OrderHandler" extends="BaseHandler" implements="IOrderHandler, IAudited">
  <cffunction name="submit" access="public">
    <cfset request.orderId = arguments.id>
  </cffunction>
</cfcomponent>
