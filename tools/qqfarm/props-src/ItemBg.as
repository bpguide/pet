package
{
   import flash.display.MovieClip;
   import flash.text.TextField;

   public dynamic class ItemBg extends MovieClip
   {
      public var txt:TextField;

      public function ItemBg()
      {
         super();
         txt.wordWrap = false;
         txt.multiline = false;
         txt.autoSize = "right";
      }
   }
}
