<!--- <cfinclude template="comment-only.cfm"> --->
<!-- <form action="comment-only.cfm"></form> -->
<cfscript>
  fakeTag = "<cfinclude template='string-only.cfm'>";
  // <cfobject component="StringOnly">
  /* <cfinclude template="block-only.cfm"> */
</cfscript>
<cfset message = "<cfinclude template='expression-only.cfm'>">
