<!--- <cfinclude template="comment-only.cfm"> --->
<!-- <form action="comment-only.cfm"></form> -->
<cfinclude template="cycle-a.cfm">
<cfscript>
  fakeMarkup = "<form action='string-only.cfm'><script src='string-only.js'></script>";
  // fetch("/string-only.cfm")
</cfscript>
