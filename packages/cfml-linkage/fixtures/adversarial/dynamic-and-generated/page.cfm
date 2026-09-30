<!--- Inert dynamic/generated/SQL fixture. Syntax is data and must never execute. --->
<cfinclude template="#url.template#">
<cfmodule name="#attributes.tag#">
<cfobject component="#url.component#" name="handler">
<cfinvoke component="#url.component#" method="#url.method#">
<cfset #variables[routeKey]# = "value">
<cfset evaluate("generatedExpression")>
<cfscript>
  // evaluate("commentOnly");
  /* evaluate("commentOnly"); */
  evaluate("generatedExpression");
</cfscript>
<cfquery name="q" datasource="#application.datasource#">
  SELECT * FROM #tableName# JOIN #otherTable#
</cfquery>
<form action="#url.target#" method="post"></form>
