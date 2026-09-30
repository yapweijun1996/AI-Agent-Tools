<cfcomponent name="repository.OrderRepository">
  <!--- queryExecute("SELECT id FROM comment_table", [], { datasource: "comment" }) --->
  <cffunction name="findOrders" access="public">
    <cfquery name="q" datasource="main">
      SELECT id, status FROM orders
    </cfquery>
    <cfset local.result = queryExecute("SELECT id FROM orders", [], { datasource: "main" })>
    <cfset local.dynamicResult = queryExecute(sqlText, [], { datasource: application.datasource })>
    <cfreturn q>
  </cffunction>
</cfcomponent>
