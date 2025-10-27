
import omittedCloseTags from './omittedCloseTags';

const voidElementTags = {
    menuitem: true,
    ...omittedCloseTags
}

export default voidElementTags