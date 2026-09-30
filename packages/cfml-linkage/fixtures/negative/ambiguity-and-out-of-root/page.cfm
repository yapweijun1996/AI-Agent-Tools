<!-- Inert negative fixture: ambiguity and path escape evidence. -->
<cfimport prefix="app" path="one">
<cfimport prefix="app" path="two">
<cfobject component="Order" name="directOrder">
<cfobject component="app.Order" name="mappedOrder">
<cfinclude template="../outside.cfm">
